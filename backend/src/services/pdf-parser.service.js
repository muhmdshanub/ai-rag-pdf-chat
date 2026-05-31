/**
 * PDFParserService
 *
 * Single responsibility: validate and parse PDF buffers.
 * For scanned/image-based pages, falls back to OCR via MuPDF (WASM) + Tesseract.js.
 * Has zero knowledge of caching or other services.
 *
 * Dependencies (all pure npm, no system binaries required):
 *   - pdf-parse:    fast digital text extraction
 *   - mupdf:        WebAssembly PDF renderer (renders pages to PNG buffers)
 *   - tesseract.js: pure-JS OCR engine
 *
 * @module services/PDFParserService
 */

const pdf = require('pdf-parse');
const Tesseract = require('tesseract.js');
const config = require('../config');
const logger = require('../utils/logger');
const { safeString, parsePDFDate } = require('../utils/helpers');
const { ServiceError } = require('../utils/errors');

// Minimum characters per page to be considered a "text" page.
// Pages below this threshold will be rendered to an image and OCR'd.
const TEXT_DENSITY_THRESHOLD = 50;

// mupdf is ESM-only, so we load it lazily via dynamic import().
let _mupdf = null;
async function getMupdf() {
  if (!_mupdf) {
    _mupdf = await import('mupdf');
  }
  return _mupdf;
}

class PDFParserService {
  constructor() {
    this.maxFileSize = config.maxFileSize;
    this.extractionTimeout = config.extractionTimeout;
  }

  // ─── Public API ─────────────────────────────────────────────────────

  /**
   * Validate that a buffer is a well-formed PDF.
   *
   * @param {Buffer} buffer
   * @throws {ServiceError}
   */
  validatePDFBuffer(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw new ServiceError('PDFParser', 'Input must be a Buffer', 'INVALID_BUFFER');
    }
    if (buffer.length === 0) {
      throw new ServiceError('PDFParser', 'Buffer is empty', 'EMPTY_BUFFER');
    }
    if (buffer.length > this.maxFileSize) {
      throw new ServiceError(
        'PDFParser',
        `Buffer exceeds maximum size of ${(this.maxFileSize / (1024 * 1024)).toFixed(0)}MB`,
        'BUFFER_TOO_LARGE'
      );
    }
    const header = buffer.toString('utf8', 0, 5);
    if (!header.startsWith('%PDF')) {
      throw new ServiceError('PDFParser', 'Does not have valid PDF signature (%PDF)', 'INVALID_PDF_SIGNATURE');
    }
  }

  /**
   * Extract text, metadata, and statistics from a PDF buffer.
   * Automatically falls back to OCR for image-based pages via MuPDF + Tesseract.
   *
   * @async
   * @param {Buffer} buffer - PDF file contents
   * @param {object} [options]
   * @param {number} [options.timeout] - Extraction timeout in ms
   * @throws {ServiceError}
   * @returns {Promise<object>} { text, pages, metadata, statistics, extractedAt }
   */
  async extractFromBuffer(buffer, options = {}) {
    const startTime = Date.now();

    this.validatePDFBuffer(buffer);

    const timeout = options.timeout || this.extractionTimeout;

    // Step 1: Standard digital text extraction with per-page tracking
    const { pdfData, pageTexts } = await this._parseWithPageTracking(buffer, timeout);

    // Step 2: Identify low-density pages that likely contain scanned images
    const lowDensityPages = pageTexts
      .map((text, idx) => ({ pageIndex: idx, pageNum: idx + 1, text }))
      .filter(({ text }) => text.trim().length < TEXT_DENSITY_THRESHOLD);

    // Step 3: Run OCR on those specific pages using MuPDF (WASM) + Tesseract
    if (lowDensityPages.length > 0) {
      logger.info(`Found ${lowDensityPages.length} low-density page(s). Starting OCR pipeline.`);
      await this._runOcrOnPages(buffer, lowDensityPages, pageTexts);
    }

    // Step 4: Assemble final text from all pages in order
    const finalText = pageTexts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();

    // Reconstruct pdfData with the enriched text
    const enrichedPdfData = { ...pdfData, text: finalText };
    const result = this._processExtractedData(enrichedPdfData);

    logger.info('PDF extraction completed', {
      pages: result.pages,
      textLength: result.text.length,
      duration: Date.now() - startTime,
    });

    return result;
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  /**
   * Run pdf-parse with a custom pagerender to capture text per-page.
   * Returns the raw pdfData object and an array of per-page text strings.
   *
   * @private
   * @param {Buffer} buffer
   * @param {number} timeout
   * @returns {Promise<{ pdfData: object, pageTexts: string[] }>}
   */
  async _parseWithPageTracking(buffer, timeout) {
    const pageTexts = [];

    const options = {
      pagerender: async function (pageData) {
        const textContent = await pageData.getTextContent({
          normalizeWhitespace: false,
          disableCombineTextItems: false,
        });

        let lastY;
        let text = '';
        for (const item of textContent.items) {
          if (lastY == null || lastY === item.transform[5]) {
            text += item.str;
          } else {
            text += '\n' + item.str;
          }
          lastY = item.transform[5];
        }

        // Store per-page text at the correct index
        pageTexts[pageData.pageIndex] = text;
        return text;
      },
    };

    try {
      const pdfData = await Promise.race([
        pdf(buffer, options),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new ServiceError(
                  'PDFParser',
                  `PDF extraction timeout after ${timeout}ms`,
                  'EXTRACTION_TIMEOUT'
                )
              ),
            timeout
          )
        ),
      ]);

      return { pdfData, pageTexts };
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (error.message.includes('Invalid PDF')) {
        throw new ServiceError('PDFParser', 'Invalid or corrupted PDF file', 'INVALID_PDF_FORMAT', error);
      }
      throw new ServiceError('PDFParser', `PDF parsing failed: ${error.message}`, 'PARSING_FAILED', error);
    }
  }

  /**
   * Render specific PDF pages to PNG buffers using MuPDF (pure WASM),
   * then extract text from those images using Tesseract.js.
   * Mutates pageTexts in-place to inject OCR results at the correct indices.
   *
   * @private
   * @param {Buffer} buffer
   * @param {{ pageIndex: number, pageNum: number }[]} lowDensityPages
   * @param {string[]} pageTexts
   */
  async _runOcrOnPages(buffer, lowDensityPages, pageTexts) {
    let mupdf;
    let doc;

    try {
      mupdf = await getMupdf();

      // Open the PDF document using MuPDF WASM engine
      doc = mupdf.PDFDocument.openDocument(buffer, 'application/pdf');

      // Spin up a single reusable Tesseract worker for all pages
      const worker = await Tesseract.createWorker('eng');

      for (const { pageIndex, pageNum } of lowDensityPages) {
        try {
          logger.info(`OCR: Rendering page ${pageNum} via MuPDF WASM...`);

          // Load the page (MuPDF uses 0-based page index)
          const page = doc.loadPage(pageIndex);

          // Render at 2x scale (200 DPI equivalent) for good OCR accuracy
          const scale = mupdf.Matrix.scale(2, 2);
          const pixmap = page.toPixmap(scale, mupdf.ColorSpace.DeviceRGB, false, true);

          // Export the rendered page as a raw PNG buffer
          const pngBuffer = pixmap.asPNG();

          logger.info(`OCR: Running Tesseract on page ${pageNum}...`);
          const { data: { text: ocrText } } = await worker.recognize(pngBuffer);

          logger.info(`OCR: Page ${pageNum} extracted ${ocrText.trim().length} characters.`);

          // Inject OCR text into the correct page slot
          pageTexts[pageIndex] = ocrText;

          // Free MuPDF pixmap memory
          pixmap.destroy();
        } catch (pageError) {
          logger.error(`OCR: Failed on page ${pageNum}: ${pageError.message}`);
          // Leave the original (empty) text — don't crash the entire pipeline
        }
      }

      await worker.terminate();
    } catch (error) {
      logger.error(`OCR pipeline failed: ${error.message}`);
      // Non-fatal: the pipeline continues with whatever text was digitally extracted
    } finally {
      if (doc) {
        try { doc.destroy(); } catch (_) {}
      }
    }
  }

  /**
   * Transform raw pdf-parse output into a standardized result.
   * @private
   */
  _processExtractedData(pdfData) {
    const pages = pdfData.numpages || 0;

    let text = (pdfData.text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

    const info = pdfData.info || {};
    const metadata = {
      title: safeString(info.Title),
      author: safeString(info.Author),
      subject: safeString(info.Subject),
      keywords: safeString(info.Keywords),
      producer: safeString(info.Producer),
      creationDate: parsePDFDate(info.CreationDate),
      modificationDate: parsePDFDate(info.ModDate),
      encrypted: pdfData.encrypted || false,
      version: info.PDFVersion || 'unknown',
    };

    const statistics = {
      totalPages: pages,
      totalCharacters: text.length,
      totalWords: text.split(/\s+/).filter((w) => w.length > 0).length,
      averageCharsPerPage: pages > 0 ? Math.round(text.length / pages) : 0,
      extractionQuality: this._calculateExtractionQuality(text, pages),
    };

    return { text, pages, metadata, statistics, extractedAt: new Date().toISOString() };
  }

  /** @private */
  _calculateExtractionQuality(text, pages) {
    if (pages > 0 && text.length < pages * 100) return 20;
    const ratio = (text.match(/[^\w\s.,!?;:\-'"()\n]/g) || []).length / (text.length || 1);
    if (ratio > 0.3) return 40;
    if (ratio > 0.15) return 70;
    return 90;
  }
}

module.exports = new PDFParserService();

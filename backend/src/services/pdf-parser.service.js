/**
 * PDFParserService
 *
 * Single responsibility: validate and parse PDF buffers.
 * Has zero knowledge of the filesystem, caching, or other services.
 *
 * @module services/PDFParserService
 */

const pdf = require('pdf-parse');
const config = require('../config');
const logger = require('../utils/logger');
const { safeString, parsePDFDate } = require('../utils/helpers');
const { ServiceError } = require('../utils/errors');

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
    const extractedData = await this._parseWithTimeout(buffer, timeout);
    const result = this._processExtractedData(extractedData);

    logger.info('PDF extraction completed', {
      pages: result.pages,
      textLength: result.text.length,
      duration: Date.now() - startTime,
    });

    return result;
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  /**
   * Run pdf-parse with a timeout guard.
   * @private
   */
  async _parseWithTimeout(buffer, timeout) {
    try {
      return await Promise.race([
        pdf(buffer),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new ServiceError('PDFParser', `PDF extraction timeout after ${timeout}ms`, 'EXTRACTION_TIMEOUT')),
            timeout
          )
        ),
      ]);
    } catch (error) {
      if (error instanceof ServiceError) throw error;

      if (error.message.includes('Invalid PDF')) {
        throw new ServiceError('PDFParser', 'Invalid or corrupted PDF file', 'INVALID_PDF_FORMAT', error);
      }

      throw new ServiceError('PDFParser', `PDF parsing failed: ${error.message}`, 'PARSING_FAILED', error);
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

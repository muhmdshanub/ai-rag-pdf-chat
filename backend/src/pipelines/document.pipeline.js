/**
 * Document Pipeline
 *
 * Orchestrates the multi-step document processing flow:
 *   validate → read → parse → chunk → embed → store
 *
 * This is the ONLY place that sequences service calls.
 * Services never call each other — the pipeline connects them.
 *
 * Used by:
 *  - upload.controller.js  (validateUpload)
 *  - process-document.job.js (process)
 */

const logger = require('../utils/logger');
const { ServiceError } = require('../utils/errors');

const CACHE_NAMESPACE = 'pdf';
const CACHE_TTL = 3600; // 1 hour

class DocumentPipeline {
  /**
   * Validate an uploaded file before creating a DB record.
   * Called synchronously during the upload request.
   *
   * @param {string} filePath - Absolute path to uploaded file
   * @returns {Promise<void>}
   * @throws {ServiceError} on validation failure
   */
  async validateUpload(filePath) {
    const { storage, pdfParser } = require('../registry');

    // Step 1: File-level checks (existence, size, extension)
    await storage.validateFile(filePath, {
      allowedExtensions: ['.pdf'],
    });

    // Step 2: PDF-level check (magic bytes)
    const buffer = await storage.readFile(filePath);
    pdfParser.validatePDFBuffer(buffer);
  }

  /**
   * Process a document end-to-end (background job).
   *
   * Flow: read → parse → chunk → embed → store → update status
   *
   * @param {number} documentId
   * @param {string} filePath
   * @param {Function} [onProgress] - Optional callback(percent) for job progress
   * @returns {Promise<{chunks: number, pages: number}>}
   */
  async process(documentId, filePath, onProgress = () => {}) {
    const { storage, pdfParser, cache, chunking, embedding, documentModel, chunkModel } = require('../registry');
    const startTime = Date.now();

    logger.info('Document pipeline started', { documentId, filePath });

    try {
      // ── Step 1: Read file ──────────────────────────────────────────
      const buffer = await storage.readFile(filePath);
      pdfParser.validatePDFBuffer(buffer);
      onProgress(10);

      // ── Step 2: Check extraction cache ─────────────────────────────
      const cacheKey = await cache.generateFileKey(filePath);
      let extracted = null;

      if (cacheKey) {
        extracted = await cache.get(CACHE_NAMESPACE, cacheKey);
      }

      if (!extracted) {
        // ── Step 3: Extract text ───────────────────────────────────
        extracted = await pdfParser.extractFromBuffer(buffer);

        // Cache the extraction result for future re-processing
        if (cacheKey) {
          await cache.set(CACHE_NAMESPACE, cacheKey, extracted, CACHE_TTL);
        }
      }
      onProgress(30);

      // ── Step 4: Chunk text ─────────────────────────────────────────
      const chunks = chunking.chunkWithMetadata(extracted.text);
      onProgress(50);

      // ── Step 5: Generate embeddings ────────────────────────────────
      const embeddings = await embedding.getEmbeddings(chunks.map((c) => c.text));
      onProgress(70);

      // ── Step 6: Store chunks + embeddings ──────────────────────────
      const chunksWithEmbeddings = chunks.map((chunk, i) => ({
        ...chunk,
        embedding: embeddings[i],
      }));
      await chunkModel.createBatch(documentId, chunksWithEmbeddings);
      onProgress(90);

      // ── Step 7: Update document status ─────────────────────────────
      await documentModel.updateChunkCount(documentId, chunks.length);
      await documentModel.updateStatus(documentId, 'completed');
      onProgress(100);

      const duration = Date.now() - startTime;
      logger.info('Document pipeline completed', {
        documentId,
        pages: extracted.pages,
        chunks: chunks.length,
        duration,
      });

      return { chunks: chunks.length, pages: extracted.pages };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Document pipeline failed', {
        documentId,
        error: error.message,
        code: error.code,
        duration,
      });

      // Mark document as failed
      await documentModel.updateStatus(documentId, 'failed', error.message).catch((dbErr) => {
        logger.error('Failed to update document status after pipeline error', { documentId, dbErr: dbErr.message });
      });

      throw error;
    }
  }
}

module.exports = new DocumentPipeline();

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
const { DOCUMENT_STATUS, CACHE_NAMESPACES } = require('../utils/constants');

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
   * Complete orchestration for uploading a new document.
   * Validates the file, creates DB record, queues the job, and handles cleanup on failure.
   * 
   * @param {Object} file - Express multer file object
   * @returns {Promise<Object>} Created document record
   */
  async upload(file) {
    const { storage, documentRepository } = require('../registry');
    const { getQueue } = require('../jobs/queue');
    const { ServiceError } = require('../utils/errors');

    if (file.mimetype !== 'application/pdf') {
      await storage.deleteFile(file.filename).catch(() => {});
      throw new ServiceError('Upload', 'Only PDF files are supported', 'INVALID_MIME_TYPE');
    }

    try {
      // 1. Validate PDF structure
      await this.validateUpload(file.path);

      // 2. Create DB Record
      const document = await documentRepository.create({
        filename: file.filename,
        originalName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype
      });

      // 3. Queue the background processing job
      try {
        const uploadQueue = getQueue();
        await uploadQueue.add('process-document', {
          documentId: document.id,
          filePath: file.path,
          mimeType: file.mimetype
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: false,
          removeOnFail: false
        });
      } catch (queueError) {
        // If queueing fails, mark the document as failed
        await documentRepository.updateStatus(document.id, DOCUMENT_STATUS.FAILED, 'Failed to queue for processing');
        throw new ServiceError('Upload', 'Failed to queue document for processing', 'QUEUE_ERROR');
      }

      return document;
    } catch (error) {
      // Clean up orphaned file on any validation error before the DB record is made
      await storage.deleteFile(file.filename).catch(() => {});
      throw error;
    }
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
    const { storage, pdfParser, cache, chunking, embedding, documentRepository, chunkRepository } = require('../registry');
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
        extracted = await cache.get(CACHE_NAMESPACES.PDF_EXTRACTION, cacheKey);
      }

      if (!extracted) {
        // ── Step 3: Extract text ───────────────────────────────────
        extracted = await pdfParser.extractFromBuffer(buffer);

        // Cache the extraction result for future re-processing
        if (cacheKey) {
          await cache.set(CACHE_NAMESPACES.PDF_EXTRACTION, cacheKey, extracted, CACHE_TTL);
        }
      }
      onProgress(30);

      // ── Step 4: Chunk text ─────────────────────────────────────────
      const chunks = await chunking.chunk(extracted.text);
      onProgress(50);

      // ── Step 5: Generate embeddings ────────────────────────────────
      const embeddings = new Array(chunks.length);
      const textsToEmbed = [];
      const missingIndices = []; // Parallel array for missing indices

      // Check cache for each chunk
      for (let i = 0; i < chunks.length; i++) {
        const text = chunks[i].text;
        const key = cache.generateStringKey(text);
        const cached = await cache.get(CACHE_NAMESPACES.EMBEDDINGS, key);
        
        if (cached) {
          embeddings[i] = cached;
        } else {
          textsToEmbed.push(text);
          missingIndices.push(i);
        }
      }

      // Generate missing embeddings and cache them
      if (textsToEmbed.length > 0) {
        logger.info(`Embedding cache miss for ${textsToEmbed.length}/${chunks.length} chunks. Calling API...`);
        const newEmbeddings = await embedding.getEmbeddings(textsToEmbed);
        
        for (let j = 0; j < textsToEmbed.length; j++) {
          const text = textsToEmbed[j];
          const vector = newEmbeddings[j];
          const originalIndex = missingIndices[j];
          
          embeddings[originalIndex] = vector;
          
          // Save to cache (24h TTL)
          const key = cache.generateStringKey(text);
          await cache.set(CACHE_NAMESPACES.EMBEDDINGS, key, vector, 86400);
        }
      } else {
        logger.info(`Embedding cache hit for all ${chunks.length} chunks!`);
      }
      onProgress(70);

      // ── Step 6: Store chunks + embeddings ──────────────────────────
      const chunksWithEmbeddings = chunks.map((chunk, i) => ({
        ...chunk,
        embedding: embeddings[i],
      }));
      await chunkRepository.createBatch(documentId, chunksWithEmbeddings);
      onProgress(90);

      // ── Step 7: Update document status ─────────────────────────────
      await documentRepository.updateChunkCount(documentId, chunks.length);
      await documentRepository.updateStatus(documentId, DOCUMENT_STATUS.COMPLETED);
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
      await documentRepository.updateStatus(documentId, DOCUMENT_STATUS.FAILED, error.message).catch((dbErr) => {
        logger.error('Failed to update document status after pipeline error', { documentId, dbErr: dbErr.message });
      });

      throw error;
    }
  }

  /**
   * List all documents
   * @returns {Promise<Array>}
   */
  async list() {
    const { documentRepository } = require('../registry');
    return await documentRepository.findAll();
  }

  /**
   * Get a specific document
   * @param {number|string} id 
   * @returns {Promise<Object>}
   * @throws {ServiceError} if not found
   */
  async get(id) {
    const { documentRepository } = require('../registry');
    const { NotFoundError } = require('../utils/errors');
    
    const document = await documentRepository.findById(id);
    if (!document) {
      throw new NotFoundError(`Document ${id} not found`);
    }
    
    return document;
  }

  /**
   * Safely delete a document and its associated files
   * @param {number|string} id 
   * @returns {Promise<void>}
   */
  async delete(id) {
    const { documentRepository, storage } = require('../registry');
    
    // 1. Verify document exists
    const document = await this.get(id); // Will throw NotFoundError if missing

    // 2. Delete from database FIRST. 
    // If this fails, the file remains safely on disk and we can retry later.
    // The CASCADE in the DB will automatically delete associated chunks and chat messages.
    await documentRepository.delete(id);

    // 3. Delete from storage AFTER successful DB deletion.
    try {
      await storage.deleteFile(document.filename);
    } catch (storageError) {
      // If file deletion fails but DB deletion succeeded, we log it.
      // The DB is clean, but there is an orphan file on disk. 
      // (An enterprise system would queue an "orphan cleanup" job here)
      logger.warn(`Orphaned file left on disk after document deletion`, { 
        filename: document.filename, 
        error: storageError.message 
      });
    }

    logger.info(`🗑️ Document ${id} completely deleted`);
  }
}

module.exports = new DocumentPipeline();

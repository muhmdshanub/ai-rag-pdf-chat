/**
 * Upload Controller
 * 
 * Handles file upload endpoint with PDF validation and queue processing.
 * All service dependencies are resolved through the registry.
 */

const { storage, documentModel, documentPipeline } = require('../registry');
const { getQueue } = require('../jobs/queue');
const logger = require('../utils/logger');

/**
 * Handle document upload
 * 
 * POST /api/upload
 * - Receives multipart/form-data with file
 * - Validates file
 * - Creates database record
 * - Queues async processing
 * - Returns immediately
 */
exports.uploadDocument = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    // Validate file exists
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided',
        code: 'NO_FILE'
      });
    }

    const { filename, path: filePath, size, mimetype } = req.file;

    logger.info('File upload received', {
      filename,
      size,
      mimetype
    });

    // Validate MIME type
    if (mimetype !== 'application/pdf') {
      await storage.deleteFile(filename);
      return res.status(400).json({
        success: false,
        error: 'Only PDF files are supported',
        code: 'INVALID_MIME_TYPE'
      });
    }

    // Delegate file + PDF validation to the orchestration pipeline
    try {
      await documentPipeline.validateUpload(filePath);
    } catch (error) {
      await storage.deleteFile(filename);
      return res.status(400).json({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_FAILED'
      });
    }

    // Create database record
    const document = await documentModel.create({
      filename,
      originalName: req.file.originalname,
      filePath,
      fileSize: size,
      mimeType: mimetype
    });

    logger.info('Document record created', {
      documentId: document.id,
      filename
    });

    // Queue async processing job
    try {
      const uploadQueue = getQueue();
      const job = await uploadQueue.add('process-document', {
        documentId: document.id,
        filePath: filePath,
        mimeType: mimetype
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: false,
        removeOnFail: false
      });

      logger.info('Processing job queued', {
        jobId: job.id,
        documentId: document.id
      });
    } catch (queueError) {
      logger.error('Failed to queue document processing', {
        documentId: document.id,
        error: queueError.message
      });
      
      // Update document status to failed
      await documentModel.updateStatus(document.id, 'failed', 'Failed to queue for processing');

      return res.status(500).json({
        success: false,
        error: 'Failed to queue document for processing',
        code: 'QUEUE_ERROR'
      });
    }

    const duration = Date.now() - startTime;

    return res.status(202).json({
      success: true,
      message: 'Document uploaded and queued for processing',
      document: {
        id: document.id,
        filename: document.filename,
        status: document.status,
        size: document.file_size,
        createdAt: document.created_at
      },
      duration
    });

  } catch (error) {
    logger.error('Upload error', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Internal server error during upload',
      code: 'UPLOAD_ERROR'
    });
  }
};

/**
 * Get upload progress
 * 
 * GET /api/upload/:documentId/progress
 */
exports.getUploadProgress = async (req, res, next) => {
  try {
    const { documentId } = req.params;

    const document = await documentModel.findById(documentId);

    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
        code: 'NOT_FOUND'
      });
    }

    return res.json({
      success: true,
      document: {
        id: document.id,
        filename: document.filename,
        status: document.status,
        totalChunks: document.total_chunks,
        progress: document.status === 'completed' ? 100 : (document.status === 'failed' ? 0 : 50)
      }
    });

  } catch (error) {
    logger.error('Progress check error', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Failed to check progress'
    });
  }
};

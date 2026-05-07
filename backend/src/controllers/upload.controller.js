/**
 * Upload Controller
 * 
 * Handles file upload endpoints. Strictly routes HTTP requests to the Document Pipeline.
 */

const { documentPipeline } = require('../registry');

/**
 * Handle document upload
 * 
 * POST /api/upload
 */
exports.uploadDocument = async (req, res, next) => {
  const startTime = Date.now();
  
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file provided',
      code: 'NO_FILE'
    });
  }

  // Pass file to the Pipeline. The Pipeline handles validation, DB, queuing, and cleanup.
  const document = await documentPipeline.upload(req.file);

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
    duration: Date.now() - startTime
  });
};

/**
 * Get upload progress
 * 
 * GET /api/upload/:documentId/progress
 */
exports.getUploadProgress = async (req, res, next) => {
  const { documentId } = req.params;

  // The Pipeline handles finding the document and throwing NotFoundError if missing
  const document = await documentPipeline.get(documentId);

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
};

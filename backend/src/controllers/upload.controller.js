const logger = require('../utils/logger');
const { BadRequestError } = require('../utils/errors');

// TODO: Wire up document model and job queue when implementing upload flow

/**
 * POST /api/upload
 * Handles file upload, saves to DB, and queues processing job
 */
const uploadDocument = async (req, res) => {
  if (!req.file) {
    throw new BadRequestError('No file provided');
  }

  const { filename, originalname, path: filepath, size, mimetype } = req.file;

  logger.info(`📄 File uploaded: ${originalname} (${(size / 1024).toFixed(1)}KB)`);

  // TODO: Save document record to DB
  // TODO: Queue async processing job (PDF parse → chunk → embed → store)

  res.status(201).json({
    success: true,
    message: 'File uploaded. Processing will begin shortly.',
    document: {
      filename,
      originalName: originalname,
      size,
      mimeType: mimetype,
    },
  });
};

module.exports = { uploadDocument };

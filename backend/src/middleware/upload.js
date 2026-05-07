/**
 * Multer Upload Middleware
 * 
 * Handles multipart/form-data file uploads with PDF-specific validation.
 * Uses base storage configuration from the config layer.
 */

const multer = require('multer');
const { storage, limits } = require('../config/multer');
const logger = require('../utils/logger');

/**
 * File filter - only allow PDFs for this specific middleware
 */
const fileFilter = (req, file, cb) => {
  // Check MIME type
  if (file.mimetype !== 'application/pdf') {
    logger.warn('Invalid file type uploaded', {
      mimetype: file.mimetype,
      filename: file.originalname
    });
    return cb(new Error('Only PDF files are allowed'));
  }

  cb(null, true);
};

/**
 * PDF Upload Middleware
 * Initialized with global storage/limits and local PDF filter.
 */
const upload = multer({
  storage,
  fileFilter,
  limits
});

// Export single file handler (expecting field name 'file')
module.exports = upload.single('file');

/**
 * Multer Storage Configuration
 * 
 * Defines the storage engine (Disk/S3) and base setup for file uploads.
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const config = require('./index');
const logger = require('../utils/logger');

// Resolve absolute path for uploads
const uploadsDir = path.resolve(process.cwd(), config.uploadDir);

// Ensure uploads directory exists on startup
fs.mkdir(uploadsDir, { recursive: true }).catch(err => {
  logger.error('Failed to create uploads directory', { error: err.message, path: uploadsDir });
});

/**
 * Standard Disk Storage Engine
 * Configures destination and unique filename generation.
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-safeoriginalname
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}-${safeName}`;
    cb(null, filename);
  }
});

module.exports = {
  storage,
  uploadsDir,
  limits: {
    fileSize: config.maxFileSize,
    files: 1
  }
};

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Storage Service — abstracts file storage operations
 *
 * Currently uses local filesystem.
 * When moving to S3/R2, only this file needs to change.
 * Controllers and other services remain untouched.
 */
class StorageService {
  constructor() {
    this.uploadDir = config.uploadDir;
    this._ensureDir(this.uploadDir);
  }

  /**
   * Get the full path for a stored file
   */
  getFilePath(filename) {
    return path.join(this.uploadDir, filename);
  }

  /**
   * Check if a file exists
   */
  async fileExists(filename) {
    const filePath = this.getFilePath(filename);
    return fs.existsSync(filePath);
  }

  /**
   * Delete a file from storage
   */
  async deleteFile(filename) {
    const filePath = this.getFilePath(filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`🗑️ File deleted: ${filename}`);
    }
  }

  /**
   * Read file contents
   */
  async readFile(filename) {
    const filePath = this.getFilePath(filename);
    return fs.readFileSync(filePath);
  }

  /**
   * Ensure directory exists
   */
  _ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}

module.exports = new StorageService();

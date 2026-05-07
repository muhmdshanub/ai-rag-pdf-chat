/**
 * Storage Service
 *
 * Abstracts all file storage operations.
 * Currently uses local filesystem.
 * When moving to S3/R2, only this file needs to change.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const { ServiceError } = require('../utils/errors');

class StorageService {
  constructor() {
    this.uploadDir = path.resolve(config.uploadDir);
    this._ensureDirSync(this.uploadDir);
  }

  // ─── Core Operations ────────────────────────────────────────────────

  /**
   * Get the absolute path for a stored file
   * @param {string} filename
   * @returns {string}
   */
  getFilePath(filename) {
    return path.join(this.uploadDir, filename);
  }

  /**
   * Check if a file exists
   * @param {string} filename
   * @returns {Promise<boolean>}
   */
  async fileExists(filename) {
    try {
      await fs.access(this.getFilePath(filename));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read a file into a Buffer
   * @param {string} filePath - Absolute path or filename in uploadDir
   * @returns {Promise<Buffer>}
   */
  async readFile(filePath) {
    const absPath = path.isAbsolute(filePath) ? filePath : this.getFilePath(filePath);
    try {
      return await fs.readFile(absPath);
    } catch (error) {
      throw new ServiceError('Storage', `Failed to read file: ${error.message}`, 'FILE_READ_ERROR', error);
    }
  }

  /**
   * Delete a file from storage
   * @param {string} filename
   */
  async deleteFile(filename) {
    const filePath = this.getFilePath(filename);
    try {
      await fs.unlink(filePath);
      logger.info('File deleted', { filename });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn('File delete failed', { filename, error: error.message });
      }
    }
  }

  // ─── File Validation ────────────────────────────────────────────────

  /**
   * Validate a file on disk: existence, type, size, extension.
   * This is the single place that knows about the filesystem.
   *
   * @param {string} filePath - Absolute or relative path
   * @param {object} [options]
   * @param {number} [options.maxSize] - Max file size in bytes
   * @param {string[]} [options.allowedExtensions] - e.g. ['.pdf', '.txt']
   * @throws {ServiceError}
   * @returns {Promise<object>} { stats, absolutePath, extension }
   */
  async validateFile(filePath, options = {}) {
    const { maxSize = config.maxFileSize, allowedExtensions = [] } = options;

    if (!filePath || typeof filePath !== 'string') {
      throw new ServiceError('Storage', 'Invalid file path provided', 'INVALID_PATH');
    }

    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);

    // Existence
    let stats;
    try {
      stats = await fs.stat(absolutePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new ServiceError('Storage', `File not found: ${filePath}`, 'FILE_NOT_FOUND', error);
      }
      throw new ServiceError('Storage', `Cannot access file: ${error.message}`, 'FILE_ACCESS_ERROR', error);
    }

    // Must be a file
    if (!stats.isFile()) {
      throw new ServiceError('Storage', 'Path must point to a file, not directory', 'NOT_A_FILE');
    }

    // Must not be empty
    if (stats.size === 0) {
      throw new ServiceError('Storage', 'File is empty', 'EMPTY_FILE');
    }

    // Size limit
    if (stats.size > maxSize) {
      const maxMB = (maxSize / (1024 * 1024)).toFixed(0);
      const actualMB = (stats.size / (1024 * 1024)).toFixed(2);
      throw new ServiceError('Storage', `File exceeds maximum size of ${maxMB}MB (actual: ${actualMB}MB)`, 'FILE_TOO_LARGE');
    }

    // Extension
    const extension = path.extname(absolutePath).toLowerCase();
    if (allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
      throw new ServiceError(
        'Storage',
        `Invalid file extension: ${extension}. Allowed: ${allowedExtensions.join(', ')}`,
        'INVALID_EXTENSION'
      );
    }

    return { stats, absolutePath, extension };
  }

  // ─── Private ────────────────────────────────────────────────────────

  /**
   * Ensure directory exists (sync, used only at startup)
   * @private
   */
  _ensureDirSync(dirPath) {
    if (!fsSync.existsSync(dirPath)) {
      fsSync.mkdirSync(dirPath, { recursive: true });
    }
  }
}

module.exports = new StorageService();

/**
 * PDF Parser Service
 *
 * Extracts text content from uploaded PDF and TXT files.
 * Uses pdf-parse library for PDF processing.
 */

const fs = require('fs');
const logger = require('../utils/logger');

// TODO: Implement PDF text extraction
// const PDFParse = require('pdf-parse');

class PDFParserService {
  /**
   * Extract text from a PDF file
   * @param {string} filePath - Path to the PDF file
   * @returns {Promise<{text: string, pages: number, metadata: object}>}
   */
  async extractText(filePath) {
    // TODO: Implement with pdf-parse
    logger.info(`📄 Parsing PDF: ${filePath}`);
    throw new Error('PDF parser not yet implemented');
  }

  /**
   * Extract text based on file MIME type
   * @param {string} filePath - Path to the file
   * @param {string} mimeType - MIME type of the file
   */
  async extractFromFile(filePath, mimeType) {
    switch (mimeType) {
      case 'application/pdf':
        return this.extractText(filePath);
      case 'text/plain': {
        const text = fs.readFileSync(filePath, 'utf-8');
        return { text, pages: 1, metadata: {} };
      }
      default:
        throw new Error(`Unsupported file type: ${mimeType}`);
    }
  }
}

module.exports = new PDFParserService();

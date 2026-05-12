/**
 * Document Repository
 *
 * Database operations for the documents table.
 */

const { pool } = require('../config/database');
const { DOCUMENT_STATUS } = require('../utils/constants');

class DocumentRepository {
  async create({ filename, originalName, filePath, fileSize, mimeType }) {
    const result = await pool.query(
      `INSERT INTO documents (filename, original_name, file_path, file_size, mime_type, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [filename, originalName, filePath, fileSize, mimeType, DOCUMENT_STATUS.PROCESSING]
    );
    return result.rows[0];
  }

  async findAll() {
    const result = await pool.query(
      `SELECT id, filename, original_name, file_size, mime_type, status, total_chunks, created_at
       FROM documents
       ORDER BY created_at DESC`
    );
    return result.rows;
  }

  async findById(id) {
    const result = await pool.query(
      `SELECT * FROM documents WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Retrieves a document and ensures it is ready for chat operations.
   * Throws domain-specific errors if the document is missing or not processed.
   * 
   * @param {number} id 
   * @throws {NotFoundError} If the document does not exist
   * @throws {BadRequestError} If the document status is not 'completed'
   * @returns {Promise<object>} The ready document
   */
  async findReadyForChat(id) {
    const document = await this.findById(id);
    if (!document) {
      const { NotFoundError } = require('../utils/errors');
      throw new NotFoundError(`Document ${id} not found`);
    }
    if (document.status !== DOCUMENT_STATUS.COMPLETED) {
      const { BadRequestError } = require('../utils/errors');
      throw new BadRequestError(`Document ${id} is not ready (status: ${document.status})`);
    }
    return document;
  }

  async updateStatus(id, status, errorMessage = null) {
    const result = await pool.query(
      `UPDATE documents
       SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [status, errorMessage, id]
    );
    return result.rows[0];
  }

  async updateChunkCount(id, totalChunks) {
    await pool.query(
      `UPDATE documents SET total_chunks = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [totalChunks, id]
    );
  }

  async delete(id) {
    await pool.query(`DELETE FROM documents WHERE id = $1`, [id]);
  }
}

module.exports = new DocumentRepository();

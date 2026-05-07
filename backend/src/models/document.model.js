/**
 * Document Model
 *
 * Database operations for the documents table.
 */

const { pool } = require('../config/database');

class DocumentModel {
  async create({ filename, originalName, filePath, fileSize, mimeType }) {
    const result = await pool.query(
      `INSERT INTO documents (filename, original_name, file_path, file_size, mime_type, status)
       VALUES ($1, $2, $3, $4, $5, 'processing')
       RETURNING *`,
      [filename, originalName, filePath, fileSize, mimeType]
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

module.exports = new DocumentModel();

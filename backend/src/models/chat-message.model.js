/**
 * Chat Message Model
 *
 * Database operations for the chat_messages table.
 */

const { pool } = require('../config/database');

class ChatMessageModel {
  async create({ documentId, userMessage, aiResponse, retrievedChunkIds, tokensUsed, modelUsed, responseTimeMs }) {
    const result = await pool.query(
      `INSERT INTO chat_messages
         (document_id, user_message, ai_response, retrieved_chunk_ids, tokens_used, model_used, response_time_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [documentId, userMessage, aiResponse, retrievedChunkIds, tokensUsed, modelUsed, responseTimeMs]
    );
    return result.rows[0];
  }

  async findByDocumentId(documentId, limit = 50) {
    const result = await pool.query(
      `SELECT id, user_message, ai_response, tokens_used, created_at
       FROM chat_messages
       WHERE document_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [documentId, limit]
    );
    return result.rows;
  }

  async deleteByDocumentId(documentId) {
    await pool.query(`DELETE FROM chat_messages WHERE document_id = $1`, [documentId]);
  }
}

module.exports = new ChatMessageModel();

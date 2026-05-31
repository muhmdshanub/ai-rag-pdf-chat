/**
 * Chunk Repository
 *
 * Database operations for the chunks table.
 * Includes pgvector similarity search.
 */

const { pool } = require('../config/database');

class ChunkRepository {
  async create({ documentId, chunkIndex, content, embedding }) {
    const result = await pool.query(
      `INSERT INTO chunks (document_id, chunk_index, content, embedding)
       VALUES ($1, $2, $3, $4::vector)
       RETURNING id, chunk_index`,
      [documentId, chunkIndex, content, JSON.stringify(embedding)]
    );
    return result.rows[0];
  }

  async createBatch(documentId, chunks) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const chunk of chunks) {
        const result = await client.query(
          `INSERT INTO chunks (document_id, chunk_index, content, embedding)
           VALUES ($1, $2, $3, $4::vector)
           RETURNING id`,
          [documentId, chunk.index, chunk.text, JSON.stringify(chunk.embedding)]
        );
        results.push(result.rows[0]);
      }
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findSimilar(queryEmbedding, documentId, topK = 5) {
    const result = await pool.query(
      `SELECT
         id,
         chunk_index,
         content,
         1 - (embedding <=> $1::vector) AS similarity
       FROM chunks
       WHERE document_id = $2
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [JSON.stringify(queryEmbedding), documentId, topK]
    );
    return result.rows;
  }

  async findByDocumentId(documentId) {
    const result = await pool.query(
      `SELECT id, chunk_index, content FROM chunks WHERE document_id = $1 ORDER BY chunk_index`,
      [documentId]
    );
    return result.rows;
  }

  async findByIds(chunkIds) {
    if (!chunkIds || chunkIds.length === 0) return [];
    // Using ANY($1::int[]) to fetch chunks by an array of IDs
    const result = await pool.query(
      `SELECT id, chunk_index, content FROM chunks WHERE id = ANY($1::int[])`,
      [chunkIds]
    );
    return result.rows;
  }

  async deleteByDocumentId(documentId) {
    await pool.query(`DELETE FROM chunks WHERE document_id = $1`, [documentId]);
  }
}

module.exports = new ChunkRepository();

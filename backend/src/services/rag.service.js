/**
 * RAG Service (Retrieval-Augmented Generation)
 *
 * Handles vector similarity search and context building.
 * Uses pgvector for similarity search in PostgreSQL.
 */

const logger = require('../utils/logger');

// TODO: Import database pool
// const { pool } = require('../config/database');

class RAGService {
  /**
   * Retrieve top-K most similar chunks for a query embedding
   * @param {number[]} queryEmbedding - Query vector
   * @param {number} documentId - Document to search within
   * @param {number} topK - Number of chunks to retrieve
   * @returns {Promise<Array>} Relevant chunks with similarity scores
   */
  async retrieveChunks(queryEmbedding, documentId, topK = 5) {
    // TODO: pgvector similarity search
    logger.info(`🔍 Retrieving top ${topK} chunks for document ${documentId}`);
    throw new Error('RAG retrieval not yet implemented');
  }

  /**
   * Build context string from retrieved chunks
   * @param {Array} chunks - Retrieved chunks
   * @returns {string} Formatted context
   */
  buildContext(chunks) {
    return chunks
      .map((chunk, i) => `[Chunk ${chunk.chunk_index}]:\n${chunk.content}`)
      .join('\n\n---\n\n');
  }

  /**
   * Build the full RAG prompt for the LLM
   * @param {string} question - User's question
   * @param {string} context - Combined chunk context
   * @returns {string} Complete prompt
   */
  buildPrompt(question, context) {
    return `You are a helpful assistant. Answer the user's question based ONLY on the provided context. If the context doesn't contain relevant information, say so.

Context:
${context}

Question: ${question}

Answer:`;
  }
}

module.exports = new RAGService();

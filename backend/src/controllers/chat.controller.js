const logger = require('../utils/logger');

// TODO: Wire up embedding, RAG, and LLM services when implementing chat flow

/**
 * POST /api/chat
 * Receives user question, retrieves context via RAG, generates answer via LLM
 */
const chat = async (req, res) => {
  const { documentId, message } = req.body;

  logger.info(`💬 Chat request for document ${documentId}: "${message.substring(0, 50)}..."`);

  // TODO: Implement RAG pipeline
  // 1. Generate embedding for user query
  // 2. Retrieve relevant chunks from pgvector
  // 3. Build context from chunks
  // 4. Call LLM with context + question
  // 5. Save to chat history
  // 6. Return answer

  res.json({
    success: true,
    answer: 'Chat endpoint is ready. RAG pipeline implementation coming soon.',
    documentId,
    retrievedChunks: 0,
    tokensUsed: 0,
  });
};

module.exports = { chat };

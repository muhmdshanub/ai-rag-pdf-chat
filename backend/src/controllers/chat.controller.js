const logger = require('../utils/logger');
const { chatPipeline } = require('../registry');

/**
 * POST /api/chat
 * Receives user question, retrieves context via RAG, generates answer via LLM
 */
const chat = async (req, res) => {
  const { documentId, message } = req.body;

  logger.info(`💬 Chat request for document ${documentId}: "${message.substring(0, 50)}..."`);

  try {
    const result = await chatPipeline.ask(documentId, message);
    
    res.json({
      success: true,
      answer: result.answer,
      documentId,
      retrievedChunks: result.chunks,
      tokensUsed: result.tokensUsed,
      modelUsed: result.modelUsed
    });
  } catch (error) {
    logger.error('Chat request failed', { documentId, error: error.message });
    
    const statusCode = error.name === 'NotFoundError' || error.name === 'BadRequestError' ? 400 : 500;
    
    res.status(statusCode).json({
      success: false,
      error: error.message,
      code: error.code || 'CHAT_ERROR'
    });
  }
};

module.exports = { chat };

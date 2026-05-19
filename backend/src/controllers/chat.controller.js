const logger = require('../utils/logger');
const { chatPipeline } = require('../registry');
const ApiResponse = require('../utils/response');

/**
 * POST /api/chat
 * Receives user question, retrieves context via RAG, generates answer via LLM
 */
const chat = async (req, res) => {
  const { documentId, message, model } = req.body;

  logger.info(`💬 Chat request for document ${documentId}: "${message.substring(0, 50)}..."`);

  const result = await chatPipeline.ask(documentId, message, { model });
  
  return ApiResponse.success(res, {
    answer: result.answer,
    documentId,
    retrievedChunks: result.chunks,
    tokensUsed: result.tokensUsed,
    modelUsed: result.model
  });
};

/**
 * POST /api/chat/stream
 * Receives user question, retrieves context, and streams natural language answer using Server-Sent Events (SSE).
 */
const chatStream = async (req, res) => {
  const { documentId, message, model } = req.body;

  logger.info(`💬 Streaming chat request for document ${documentId}: "${message.substring(0, 50)}..."`);

  // Configure Server-Sent Events (SSE) headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Prevent proxy buffering in Nginx

  try {
    const generator = chatPipeline.askStream(documentId, message, { model });

    for await (const chunk of generator) {
      res.write(`event: ${chunk.event}\ndata: ${JSON.stringify(chunk.data)}\n\n`);
    }

    res.write('event: done\ndata: [DONE]\n\n');
    res.end();
  } catch (error) {
    logger.error('Streaming chat controller failed', { error: error.message });

    const statusCode = error.statusCode || 500;
    const errorCode = error.code || 'STREAM_ERROR';

    // Output SSE error event and close
    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message, code: errorCode, statusCode })}\n\n`);
    res.end();
  }
};

module.exports = { 
  chat,
  chatStream
};

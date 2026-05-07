/**
 * Chat Pipeline
 *
 * Orchestrates the RAG chat flow:
 *   embed query → retrieve chunks → build context → LLM → save message
 *
 * Services never call each other — the pipeline connects them.
 *
 * Used by:
 *  - chat.controller.js
 */

const logger = require('../utils/logger');

class ChatPipeline {
  /**
   * Handle a user question against a specific document.
   *
   * @param {number} documentId
   * @param {string} message - User's question
   * @returns {Promise<{answer: string, chunks: number, tokensUsed: number, model: string}>}
   */
  async ask(documentId, message) {
    const { embedding, rag, llm, documentModel, chunkModel, chatMessageModel } = require('../registry');
    const startTime = Date.now();

    logger.info('Chat pipeline started', { documentId, messagePreview: message.substring(0, 50) });

    // Step 1: Verify document exists and is processed
    const document = await documentModel.findReadyForChat(documentId);

    // Step 2: Generate embedding for the user's query
    const queryEmbedding = await embedding.getEmbedding(message);

    // Step 3: Retrieve relevant chunks via similarity search
    const relevantChunks = await chunkModel.findSimilar(queryEmbedding, documentId, 5);

    // Step 4: Build context from retrieved chunks
    const context = rag.buildContext(relevantChunks);

    // Step 5: Build prompt and call LLM
    const prompt = rag.buildPrompt(message, context);
    const { answer, tokens, model } = await llm.generateAnswer(
      'You are a helpful assistant that answers questions based on document content.',
      prompt
    );

    // Step 6: Save to chat history
    const responseTimeMs = Date.now() - startTime;
    await chatMessageModel.create({
      documentId,
      userMessage: message,
      aiResponse: answer,
      retrievedChunkIds: relevantChunks.map((c) => c.id),
      tokensUsed: tokens,
      modelUsed: model,
      responseTimeMs,
    });

    logger.info('Chat pipeline completed', {
      documentId,
      chunks: relevantChunks.length,
      tokens,
      duration: responseTimeMs,
    });

    return {
      answer,
      chunks: relevantChunks.length,
      tokensUsed: tokens,
      model,
    };
  }
}

module.exports = new ChatPipeline();

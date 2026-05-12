/**
 * Chat Pipeline
 *
 * Orchestrates the RAG chat flow:
 *   embed query → retrieve chunks → filter → build context → LLM → save message
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
    const { embedding, rag, llm, cache, documentRepository, chunkRepository, chatMessageRepository } = require('../registry');
    const config = require('../config');
    const startTime = Date.now();

    logger.info('Chat pipeline started', { documentId, messagePreview: message.substring(0, 50) });

    // Step 1: Verify document exists and is processed
    const document = await documentRepository.findReadyForChat(documentId);

    // Step 2: Generate embedding for the user's query
    const cacheKey = cache.generateStringKey(`query_embed_${message}`);
    let queryEmbedding = await cache.get('embedding', cacheKey);
    let embeddingCached = true;

    if (!queryEmbedding) {
      const newEmbeddings = await embedding.getEmbeddings([message]);
      queryEmbedding = newEmbeddings[0];
      embeddingCached = false;
      await cache.set('embedding', cacheKey, queryEmbedding, 86400); // Cache for 24 hours
    }

    // Step 3: Wide-Net Retrieval
    // We fetch a larger number of chunks to ensure high recall
    const similarChunks = await chunkRepository.findSimilar(
      queryEmbedding, 
      documentId, 
      config.rag.recallK
    );

    // Step 4: Dynamic Refinement (The "Perfect RAG" logic)
    // Filter by threshold, gap detection, and token budget
    const relevantChunks = rag.refineContext(similarChunks, {
      minSimilarity: config.rag.minSimilarity,
      maxContextLength: config.rag.maxContextChars
    });

    // Step 5: Build context from retrieved chunks
    const context = rag.buildContext(relevantChunks);

    // Step 6: Build prompt and call LLM
    const { system, user } = rag.buildPrompt(message, context);
    const { answer, tokens, model } = await llm.generateAnswer(
      system,
      user
    );

    // Step 7: Save to chat history
    const responseTimeMs = Date.now() - startTime;
    await chatMessageRepository.create({
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
      retrievedChunks: similarChunks.length,
      usedChunks: relevantChunks.length,
      embeddingCached,
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

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
    const startTime = Date.now();

    logger.info('Chat pipeline started', { documentId, messagePreview: message.substring(0, 50) });

    // Step 1: Verify document exists and is processed
    const document = await documentRepository.findReadyForChat(documentId);

    // Step 2: Generate embedding for the user's query
    const cacheKey = cache.generateStringKey(`query_embed_${message}`);
    let queryEmbedding = await cache.get('embedding', cacheKey);
    let embeddingCached = true;

    if (!queryEmbedding) {
      // The current EmbeddingService exposes `getEmbeddings` (array in, array out)
      const newEmbeddings = await embedding.getEmbeddings([message]);
      queryEmbedding = newEmbeddings[0];
      embeddingCached = false;
      await cache.set('embedding', cacheKey, queryEmbedding, 86400); // Cache for 24 hours
    }

    // Step 3: Retrieve a larger pool of chunks via similarity search (e.g., 15)
    // We fetch a larger pool so that if there are 8 highly relevant chunks, we don't miss them.
    const similarChunks = await chunkRepository.findSimilar(queryEmbedding, documentId, 15);

    // Step 4: Filter chunks dynamically based on the similarity threshold (e.g., must be > 0.3)
    // This removes irrelevant chunks. If only 2 chunks match, it keeps 2. If 10 match, it keeps 10.
    const relevantChunks = rag.filterChunks(similarChunks);

    // Step 5: Build context from retrieved chunks
    // This dynamically truncates the final string if it exceeds the maximum context length (e.g., 3000 chars)
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

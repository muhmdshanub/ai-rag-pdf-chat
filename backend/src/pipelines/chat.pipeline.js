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
const { CACHE_NAMESPACES } = require('../utils/constants');

class ChatPipeline {
  /**
   * Handle a user question against a specific document.
   *
   * @param {number} documentId
   * @param {string} message - User's question
   * @param {Object} [options] - Options (model)
   * @returns {Promise<{answer: string, chunks: number, tokensUsed: number, model: string}>}
   */
  async ask(documentId, message, options = {}) {
    const { embedding, rag, llm, cache, queryRewriter, reranker, documentRepository, chunkRepository, chatMessageRepository } = require('../registry');
    const { NotFoundError } = require('../utils/errors');
    const config = require('../config');
    const startTime = Date.now();

    logger.info('Chat pipeline started', { documentId, messagePreview: message.substring(0, 50) });

    // Step 1: Verify document exists and is processed
    const document = await documentRepository.findReadyForChat(documentId);
    if (!document) {
      throw new NotFoundError(`Document with ID ${documentId} not found or is not fully processed yet.`);
    }

    // Step 2: Generate embedding for the user's query
    const cacheKey = cache.generateStringKey(`query_embed_${message}`);
    let queryEmbedding = await cache.get(CACHE_NAMESPACES.EMBEDDINGS, cacheKey);
    let embeddingCached = true;

    if (!queryEmbedding) {
      const newEmbeddings = await embedding.getEmbeddings([message]);
      queryEmbedding = newEmbeddings[0];
      embeddingCached = false;
      await cache.set(CACHE_NAMESPACES.EMBEDDINGS, cacheKey, queryEmbedding, 86400); // Cache for 24 hours
    }

    // Step 2.5: Query Rewriting — extract keywords for FTS (vector still uses original question)
    const ftsQuery = await queryRewriter.extractKeywords(message);

    // Step 3: Wide-Net Retrieval
    const similarChunks = await chunkRepository.findSimilar(
      ftsQuery,
      queryEmbedding,
      documentId,
      config.rag.recallK
    );

    // Step 3.5: Cross-Encoder Re-ranking (reorders chunks by joint query+passage score)
    const rerankedChunks = await reranker.rerank(message, similarChunks);

    // Step 4: Dynamic Refinement (Perfect RAG logic)
    const refinedChunks = rag.refineContext(rerankedChunks, {
      minSimilarity: config.rag.minSimilarity,
      maxContextLength: config.rag.maxContextChars
    });

    // Step 4.5: MMR Diversification — remove near-duplicate chunks
    const relevantChunks = rag.applyMMR(refinedChunks, { lambda: config.rag.mmr.lambda });

    // Step 5: Build context from retrieved chunks
    const context = rag.buildContext(relevantChunks);

    // Step 6: Build prompt and call LLM
    const { system, user } = rag.buildPrompt(message, context);
    const model = options.model || config.llm.defaultModel;

    const { answer, tokens, durationMs } = await llm.generateAnswer(
      system,
      user,
      { model }
    );

    // Step 7: Save to chat history
    const responseTimeMs = Date.now() - startTime;
    await chatMessageRepository.create({
      documentId,
      userMessage: message,
      aiResponse: answer,
      retrievedChunkIds: relevantChunks.map((c) => c.id),
      tokensUsed: tokens?.total || 0,
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

  /**
   * Handle a user question and stream the response tokens in real-time.
   *
   * @param {number} documentId
   * @param {string} message - User's question
   * @param {Object} [options] - Options (model)
   * @yields {Object} Stream events ({ event: 'metadata' | 'token', data: any })
   */
  async *askStream(documentId, message, options = {}) {
    const { embedding, rag, llm, cache, queryRewriter, reranker, documentRepository, chunkRepository, chatMessageRepository } = require('../registry');
    const { NotFoundError } = require('../utils/errors');
    const config = require('../config');
    const startTime = Date.now();

    logger.info('Chat streaming pipeline started', { documentId, messagePreview: message.substring(0, 50) });

    // Step 1: Verify document exists and is processed
    const document = await documentRepository.findReadyForChat(documentId);
    if (!document) {
      throw new NotFoundError(`Document with ID ${documentId} not found or is not fully processed yet.`);
    }

    // Step 2: Generate embedding for the user's query
    const cacheKey = cache.generateStringKey(`query_embed_${message}`);
    let queryEmbedding = await cache.get(CACHE_NAMESPACES.EMBEDDINGS, cacheKey);

    if (!queryEmbedding) {
      const newEmbeddings = await embedding.getEmbeddings([message]);
      queryEmbedding = newEmbeddings[0];
      await cache.set(CACHE_NAMESPACES.EMBEDDINGS, cacheKey, queryEmbedding, 86400); // Cache for 24 hours
    }

    // Step 2.5: Query Rewriting — extract keywords for FTS
    const ftsQuery = await queryRewriter.extractKeywords(message);

    // Step 3: Wide-Net Retrieval
    const similarChunks = await chunkRepository.findSimilar(
      ftsQuery,
      queryEmbedding,
      documentId,
      config.rag.recallK
    );

    // Step 3.5: Cross-Encoder Re-ranking
    const rerankedChunks = await reranker.rerank(message, similarChunks);

    // Step 4: Dynamic Refinement (Perfect RAG logic)
    const refinedChunks = rag.refineContext(rerankedChunks, {
      minSimilarity: config.rag.minSimilarity,
      maxContextLength: config.rag.maxContextChars
    });

    // Step 4.5: MMR Diversification
    const relevantChunks = rag.applyMMR(refinedChunks, { lambda: config.rag.mmr.lambda });

    yield {
      event: 'metadata',
      data: {
        chunks: relevantChunks.map((c, index) => ({
          chunkIndex: index + 1,
          dbChunkIndex: c.chunk_index,
          similarity: parseFloat(c.similarity || 0),
          content: c.content
        }))
      }
    };

    // Step 5: Build context from retrieved chunks
    const context = rag.buildContext(relevantChunks);

    // Step 6: Build prompt and stream tokens from LLM
    const { system, user } = rag.buildPrompt(message, context);
    const model = options.model || config.llm.defaultModel;

    let fullAnswer = '';
    const tokenGenerator = llm.generateAnswerStream(system, user, { model });

    for await (const token of tokenGenerator) {
      fullAnswer += token;
      yield {
        event: 'token',
        data: token
      };
    }

    // Step 7: Save to chat history on stream completion
    const responseTimeMs = Date.now() - startTime;
    // Estimate total tokens for database metrics tracking
    const promptTokensEst = Math.ceil((system.length + user.length) / 4);
    const completionTokensEst = Math.ceil(fullAnswer.length / 4);
    const totalTokensEst = promptTokensEst + completionTokensEst;

    await chatMessageRepository.create({
      documentId,
      userMessage: message,
      aiResponse: fullAnswer,
      retrievedChunkIds: relevantChunks.map((c) => c.id),
      tokensUsed: totalTokensEst,
      modelUsed: model,
      responseTimeMs,
    });

    logger.info('Chat streaming pipeline completed', {
      documentId,
      usedChunks: relevantChunks.length,
      duration: responseTimeMs,
    });
  }
}

module.exports = new ChatPipeline();

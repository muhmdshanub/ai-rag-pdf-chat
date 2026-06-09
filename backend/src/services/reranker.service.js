/**
 * Reranker Service (Cross-Encoder Re-ranking)
 *
 * Bi-encoder vector search embeds the question and chunks SEPARATELY,
 * so it never sees the relationship between them. A cross-encoder
 * model scores the (question, chunk) pair TOGETHER — giving a far
 * more accurate relevance score.
 *
 * This service wraps the HuggingFace cross-encoder API call.
 * Scores are normalized from raw logits to a 0–1 scale so that
 * the existing rag.service.js threshold/gap logic is unaffected.
 *
 * Rules:
 * - NO database queries
 * - MUST fallback gracefully (returns original order on any failure)
 * - Output chunks MUST have the same shape as input chunks
 */

const logger = require('../utils/logger');
const config = require('../config');

class RerankerService {
  constructor() {
    this.enabled = config.rag.reranker.enabled;
    this.model = config.rag.reranker.model;
  }

  /**
   * Re-rank chunks using a cross-encoder model.
   *
   * Each (query, chunk.content) pair is scored together by the model,
   * then chunks are sorted by this new score (highest first).
   * The `.similarity` field on each chunk is replaced with the
   * normalized cross-encoder score so downstream services are unaware.
   *
   * On any API failure, returns the original chunks unmodified.
   *
   * @param {string} query        - The user's original question
   * @param {Array}  chunks       - Array of { id, chunk_index, content, similarity, embedding }
   * @returns {Promise<Array>}    - Re-ordered chunks with updated similarity scores
   */
  async rerank(query, chunks) {
    if (!this.enabled) {
      logger.debug('Reranker disabled, returning original chunk order');
      return chunks;
    }

    if (!chunks || chunks.length === 0) return chunks;

    // No point re-ranking a single chunk
    if (chunks.length === 1) return chunks;

    try {
      const { HfInference } = require('@huggingface/inference');
      const hf = new HfInference(config.huggingfaceApiKey);

      // Build (query, passage) pairs for the cross-encoder
      const inputs = chunks.map(chunk => ({
        text: query,
        text_pair: chunk.content,
      }));

      logger.debug(`Reranker scoring ${chunks.length} chunks`, { model: this.model });

      // HuggingFace text-classification endpoint for cross-encoders
      const scores = await hf.textClassification({
        model: this.model,
        inputs: inputs.map(i => `${i.text} [SEP] ${i.text_pair}`),
      });

      // Normalize raw logit scores to 0–1 using sigmoid
      const sigmoid = (x) => 1 / (1 + Math.exp(-x));

      const reranked = chunks
        .map((chunk, i) => {
          const rawScore = Array.isArray(scores)
            ? (scores[i]?.score ?? scores[i]?.[0]?.score ?? 0)
            : 0;
          return {
            ...chunk,
            similarity: sigmoid(rawScore),       // normalized 0–1, replaces cosine sim
            _originalSimilarity: chunk.similarity, // preserved for logging
          };
        })
        .sort((a, b) => b.similarity - a.similarity);

      logger.info('Reranker completed', {
        chunks: reranked.length,
        topScore: reranked[0]?.similarity?.toFixed(4),
        bottomScore: reranked[reranked.length - 1]?.similarity?.toFixed(4),
      });

      return reranked;

    } catch (error) {
      // Graceful degradation — never block the chat pipeline
      logger.warn('Reranker failed, falling back to original chunk order', {
        error: error.message,
        model: this.model,
      });
      return chunks;
    }
  }
}

module.exports = new RerankerService();

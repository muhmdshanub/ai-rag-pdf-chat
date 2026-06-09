/**
 * RAG Service (Retrieval-Augmented Generation)
 *
 * Pure business logic service for RAG operations.
 * Handles semantic similarity filtering, context building, and prompt engineering.
 * 
 * Rules:
 * - NO external API calls
 * - NO database queries
 * - MUST be 100% testable without mocks
 */

const logger = require('../utils/logger');
const config = require('../config');

class RAGService {
  constructor() {
    this.defaults = {
      minSimilarity: config.rag.minSimilarity,
      maxContextLength: config.rag.maxContextChars,
      gapThreshold: config.rag.gapThreshold
    };

    this.systemPrompt = config.rag.defaultSystemPrompt;
  }

  /**
   * Filter chunks by a minimum similarity threshold
   * 
   * @param {Array} chunks - Retrieved chunks from pgvector
   * @param {number} minSimilarity - Minimum threshold (0.0 to 1.0)
   * @returns {Array} Filtered chunks
   */
  filterChunks(chunks, minSimilarity = this.defaults.minSimilarity) {
    if (!chunks || chunks.length === 0) return [];
    
    return chunks.filter(chunk => {
      // pgvector cosine distance returns similarity as a float
      const similarity = parseFloat(chunk.similarity);
      return similarity >= minSimilarity;
    });
  }

  /**
   * Refine retrieved chunks using dynamic thresholding and token budgeting.
   * 
   * This is the "Perfect RAG" logic:
   * 1. Remove noise (hard threshold)
   * 2. Detect relevance gaps (the "elbow" logic)
   * 3. Pack context up to a character/token budget
   * 
   * @param {Array} chunks - Raw chunks from the database
   * @param {Object} options - Custom thresholds/budgets
   * @returns {Array} Refined high-quality chunks
   */
  refineContext(chunks, options = {}) {
    const minSimilarity = options.minSimilarity || this.defaults.minSimilarity;
    const maxChars = options.maxContextLength || this.defaults.maxContextLength;
    const gapThreshold = options.gapThreshold || this.defaults.gapThreshold;

    if (!chunks || chunks.length === 0) return [];

    const refined = [];
    let currentChars = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const similarity = parseFloat(chunk.similarity);

      // 1. Hard Threshold Check
      if (similarity < minSimilarity) {
        logger.debug(`Stopping at chunk ${i}: Similarity ${similarity} below threshold ${minSimilarity}`);
        break;
      }

      // 2. Gap Detection (The "Elbow" Logic)
      // Ensure we at least keep the top 3 chunks to avoid dropping valid info on dense docs
      if (i >= 3) {
        const prevSimilarity = parseFloat(chunks[i - 1].similarity);
        if (prevSimilarity - similarity > gapThreshold) {
          logger.info(`Detected relevance gap at chunk ${i}: ${prevSimilarity} -> ${similarity}. Cutting off.`);
          break;
        }
      }

      // 3. Token/Char Budgeting
      // Estimate if adding this chunk exceeds our safety budget
      const estimate = chunk.content.length + 100; // content + formatting overhead
      if (currentChars + estimate > maxChars) {
        logger.warn(`Context budget reached (${currentChars} chars). Skipping remaining chunks.`);
        break;
      }

      refined.push(chunk);
      currentChars += estimate;
    }

    logger.info('Context refined', {
      original: chunks.length,
      refined: refined.length,
      totalChars: currentChars
    });

    return refined;
  }

  /**
   * Build formatted context string from retrieved chunks
   * 
   * Formats chunks with:
   * - Chunk index for reference
   * - Similarity score
   * - Text content
   * 
   * @param {Array} chunks - Filtered chunks
   * @param {number} maxLength - Maximum characters to include
   * @returns {string} Formatted context
   */
  buildContext(chunks, maxLength = this.defaults.maxContextLength) {
    if (!chunks || chunks.length === 0) {
      return '';
    }

    let currentLength = 0;
    const contextParts = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const sourceId = i + 1;
      
      const part = `[${sourceId}]:\n${chunk.content}`;
      
      // Prevent exceeding context limits
      if (currentLength + part.length > maxLength && i > 0) {
        logger.warn(`Truncated context at chunk ${i} to stay under limit of ${maxLength}`);
        break;
      }

      contextParts.push(part);
      currentLength += part.length;
    }

    return contextParts.join('\n\n' + '─'.repeat(80) + '\n\n');
  }

  /**
   * Build the structured prompt for the LLM
   * 
   * @param {string} query - User question
   * @param {string} context - Formatted context from retrieved chunks
   * @returns {Object} { system, user }
   */
  buildPrompt(query, context) {
    if (!query || typeof query !== 'string') {
      throw new Error('Query must be a valid string');
    }

    let userPrompt = '';

    if (context && context.trim().length > 0) {
      userPrompt += `Context from document:\n\n${context}\n\n`;
      userPrompt += '─'.repeat(80) + '\n\n';
      userPrompt += `Question: ${query}\n\n`;
      userPrompt += 'Instructions:\n';
      userPrompt += '- Answer using the context above\n';
      userPrompt += '- Reference chunk numbers if using specific information\n';
    } else {
      userPrompt += `Question: ${query}\n\n`;
      userPrompt += 'Note: No relevant context found in the document for this question.';
    }

    return {
      system: this.systemPrompt,
      user: userPrompt
    };
  }
  /**
   * Apply Maximal Marginal Relevance to diversify the context.
   *
   * Prevents sending 5 near-identical chunks to the LLM by penalising
   * chunks that are too similar to already-selected chunks.
   *
   * Algorithm:
   *   For each candidate chunk, compute:
   *     MMR_score = λ × sim_to_query − (1-λ) × max_sim_to_selected
   *   Select the chunk with the highest MMR score, repeat until budget.
   *
   * @param {Array}  chunks          - Refined chunks (each must have .similarity and .embedding)
   * @param {Object} options
   * @param {number} options.lambda  - Balance relevance vs diversity (0=pure diversity, 1=pure relevance)
   * @param {number} options.maxChunks - Max chunks to return
   * @returns {Array} Diversified chunk array
   */
  applyMMR(chunks, options = {}) {
    const lambda = options.lambda ?? config.rag.mmr.lambda;
    const maxChunks = options.maxChunks ?? chunks.length;

    if (!chunks || chunks.length <= 1) return chunks;

    // Chunks without embeddings cannot be MMR-processed — pass through
    const hasEmbeddings = chunks.every(c => Array.isArray(c.embedding) && c.embedding.length > 0);
    if (!hasEmbeddings) {
      logger.debug('MMR skipped: chunks missing embedding vectors');
      return chunks;
    }

    try {
      const cosineSimilarity = (a, b) => {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
          dot   += a[i] * b[i];
          normA += a[i] * a[i];
          normB += b[i] * b[i];
        }
        return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
      };

      const selected = [];
      const remaining = [...chunks];

      while (selected.length < maxChunks && remaining.length > 0) {
        let bestIdx = 0;
        let bestScore = -Infinity;

        for (let i = 0; i < remaining.length; i++) {
          const candidate = remaining[i];
          const relevance = parseFloat(candidate.similarity); // sim to query (from vector/FTS)

          // Max similarity to any already-selected chunk
          const redundancy = selected.length === 0
            ? 0
            : Math.max(...selected.map(s => cosineSimilarity(candidate.embedding, s.embedding)));

          const mmrScore = lambda * relevance - (1 - lambda) * redundancy;

          if (mmrScore > bestScore) {
            bestScore = mmrScore;
            bestIdx = i;
          }
        }

        selected.push(remaining[bestIdx]);
        remaining.splice(bestIdx, 1);
      }

      logger.info('MMR diversification applied', {
        input: chunks.length,
        output: selected.length,
        lambda,
      });

      return selected;

    } catch (error) {
      logger.warn('MMR failed, returning original chunk order', { error: error.message });
      return chunks;
    }
  }
}

module.exports = new RAGService();

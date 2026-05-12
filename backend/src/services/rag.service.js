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

class RAGService {
  constructor() {
    this.defaults = {
      minSimilarity: 0.3,               // Minimum similarity threshold (0-1)
      maxContextLength: 3000            // Maximum context chars before truncation
    };

    this.systemPrompt = `You are a helpful AI assistant answering questions based strictly on the provided document context.

Guidelines:
1. Use ONLY information from the provided context.
2. If the context doesn't contain the answer, say "The provided context doesn't contain information about this."
3. Cite which chunk numbers you are using.
4. Be clear and concise.
5. Do not make up information or use outside knowledge.`;
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
    const gapThreshold = 0.15; // Stop if there is a 15% drop in similarity

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
      // If there is a massive drop between this chunk and the previous one, stop.
      if (i > 0) {
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
      const similarity = parseFloat(chunk.similarity || 0).toFixed(2);
      
      const part = `[Chunk ${chunk.chunk_index} | Similarity: ${similarity}]:\n${chunk.content}`;
      
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
}

module.exports = new RAGService();

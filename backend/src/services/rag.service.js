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

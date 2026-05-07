/**
 * LLM Service
 *
 * Handles communication with the Groq API for text generation.
 * Uses open-source models (Mixtral, Llama, etc.)
 */

const logger = require('../utils/logger');

// TODO: Implement Groq API integration
// const axios = require('axios');
// const config = require('../config');

class LLMService {
  /**
   * Generate an answer using the LLM
   * @param {string} systemPrompt - System instructions
   * @param {string} userPrompt - User message with context
   * @returns {Promise<{answer: string, tokens: number, model: string}>}
   */
  async generateAnswer(systemPrompt, userPrompt) {
    // TODO: Call Groq API
    logger.info('🤖 Calling LLM for answer generation');
    throw new Error('LLM service not yet implemented');
  }
}

module.exports = new LLMService();

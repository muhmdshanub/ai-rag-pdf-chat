const logger = require('../utils/logger');
const groqClient = require('../utils/groq.client');
const config = require('../config');
const { AI_ROLES } = require('../utils/constants');

/**
 * LLM Service
 * 
 * Handles business logic for Large Language Model operations.
 * Maps domain requests to specific API implementations.
 */
class LLMService {
  constructor() {
    this.models = config.llm.models;
    this.defaultModel = config.llm.defaultModel;
  }

  /**
   * Generate an answer based on provided prompts
   * 
   * @param {string} systemPrompt - Instructions for the AI
   * @param {string} userPrompt - User question with context
   * @param {Object} options - Generation options (model, temperature, etc.)
   * @returns {Promise<Object>} { answer, tokens, model }
   */
  async generateAnswer(systemPrompt, userPrompt, options = {}) {
    const model = options.model || this.defaultModel;
    const temperature = options.temperature ?? config.llm.defaultTemperature;

    logger.info(`LLM Request: model=${model}, temp=${temperature}`);

    const payload = {
      model,
      messages: [
        { role: AI_ROLES.SYSTEM, content: systemPrompt },
        { role: AI_ROLES.USER, content: userPrompt }
      ],
      temperature,
      max_tokens: options.maxTokens || config.llm.maxTokens
    };

    const startTime = Date.now();
    const response = await groqClient.chatCompletion(payload);
    const duration = Date.now() - startTime;

    const result = {
      answer: response.choices[0].message.content,
      tokens: response.usage?.total_tokens || 0,
      model,
      durationMs: duration
    };

    logger.info('LLM Response received', { 
      tokens: result.tokens, 
      duration: result.durationMs 
    });

    return result;
  }

  /**
   * List available models
   */
  getModels() {
    return Object.keys(this.models).map(id => ({ id, ...this.models[id] }));
  }
}

module.exports = new LLMService();

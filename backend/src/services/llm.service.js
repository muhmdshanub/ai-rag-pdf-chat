const logger = require('../utils/logger');
const groqClient = require('../utils/groq.client');

/**
 * LLM Service
 * 
 * Handles business logic for Large Language Model operations.
 * Maps domain requests to specific API implementations.
 */
class LLMService {
  constructor() {
    this.models = {
      'llama-3-70b-8192': { name: 'Llama 3 70B', costPer1k: 0.0007 },
      'mixtral-8x7b-32768': { name: 'Mixtral 8x7B', costPer1k: 0.0005 }
    };
    this.defaultModel = 'llama-3-70b-8192';
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
    const temperature = options.temperature ?? 0.1; // Low temperature for factual RAG

    logger.info(`LLM Request: model=${model}, temp=${temperature}`);

    const payload = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature,
      max_tokens: options.maxTokens || 1024
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

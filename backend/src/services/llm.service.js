const logger = require('../utils/logger');
const groqClient = require('../utils/groq.client');
const config = require('../config');
const { AI_ROLES } = require('../utils/constants');
const { ServiceError } = require('../utils/errors');

/**
 * LLM Service
 * 
 * Handles Large Language Model operations using Groq API via groqClient.
 * Fully stateless, config-driven, and robust.
 */
class LLMService {
  constructor() {
    this.models = config.llm.models;
    this.defaultModel = config.llm.defaultModel;
  }

  /**
   * Validate parameters before invoking LLM
   * @private
   */
  _validateParams(model, temperature, maxTokens) {
    if (!this.models[model]) {
      throw new ServiceError(
        'LLMService',
        `Unknown model: ${model}`,
        'UNKNOWN_MODEL'
      );
    }

    if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
      throw new ServiceError(
        'LLMService',
        `Invalid temperature: ${temperature}. Must be between 0 and 2.`,
        'INVALID_TEMPERATURE'
      );
    }

    if (maxTokens && (!Number.isInteger(maxTokens) || maxTokens <= 0)) {
      throw new ServiceError(
        'LLMService',
        `Invalid maxTokens: ${maxTokens}. Must be a positive integer.`,
        'INVALID_MAX_TOKENS'
      );
    }
  }

  /**
   * Calculate token cost using split input/output pricing (per 1M tokens)
   * Groq bills input tokens and output (completion) tokens at different rates.
   * @private
   */
  _calculateCost(model, promptTokens = 0, completionTokens = 0) {
    const modelConfig = this.models[model];
    if (!modelConfig) return 0;

    const inputCost  = (promptTokens     / 1_000_000) * (modelConfig.inputCostPer1m  || 0);
    const outputCost = (completionTokens / 1_000_000) * (modelConfig.outputCostPer1m || 0);

    return inputCost + outputCost;
  }

  /**
   * Generate an answer based on provided prompts
   * 
   * @param {string} systemPrompt - Instructions for the AI
   * @param {string} userPrompt - User question with context
   * @param {Object} options - Generation options (model, temperature, etc.)
   * @returns {Promise<Object>} { answer, tokens, model, durationMs, cost }
   */
  async generateAnswer(systemPrompt, userPrompt, options = {}) {
    const model = options.model || this.defaultModel;
    const temperature = options.temperature ?? config.llm.defaultTemperature;
    const maxTokens = options.maxTokens || config.llm.maxTokens;

    this._validateParams(model, temperature, maxTokens);

    logger.info(`LLM Request: model=${model}, temp=${temperature}`);

    const payload = {
      model,
      messages: [
        { role: AI_ROLES.SYSTEM, content: systemPrompt },
        { role: AI_ROLES.USER, content: userPrompt }
      ],
      temperature,
      max_tokens: maxTokens
    };

    const startTime = Date.now();
    try {
      const response = await groqClient.chatCompletion(payload);
      const duration = Date.now() - startTime;

      const promptTokens     = response.usage?.prompt_tokens     || 0;
      const completionTokens = response.usage?.completion_tokens || 0;
      const totalTokens      = response.usage?.total_tokens      || 0;
      const cost = this._calculateCost(model, promptTokens, completionTokens);

      const result = {
        answer: response.choices[0].message.content,
        tokens: {
          prompt:     promptTokens,
          completion: completionTokens,
          total:      totalTokens,
        },
        model,
        durationMs: duration,
        cost
      };

      logger.info('LLM Response received', { 
        promptTokens,
        completionTokens,
        totalTokens,
        durationMs: result.durationMs,
        cost: result.cost
      });

      return result;
    } catch (error) {
      logger.error('LLM generation failed', { error: error.message });
      throw new ServiceError(
        'LLMService',
        `LLM generation failed: ${error.message}`,
        'LLM_GENERATION_FAILED',
        error
      );
    }
  }

  /**
   * Generate an answer stream based on provided prompts
   * 
   * @param {string} systemPrompt - Instructions for the AI
   * @param {string} userPrompt - User question with context
   * @param {Object} options - Generation options (model, temperature, etc.)
   * @yields {string} Real-time tokens from Groq API
   */
  async *generateAnswerStream(systemPrompt, userPrompt, options = {}) {
    const model = options.model || this.defaultModel;
    const temperature = options.temperature ?? config.llm.defaultTemperature;
    const maxTokens = options.maxTokens || config.llm.maxTokens;

    this._validateParams(model, temperature, maxTokens);

    logger.info(`LLM Stream Request: model=${model}, temp=${temperature}`);

    const payload = {
      model,
      messages: [
        { role: AI_ROLES.SYSTEM, content: systemPrompt },
        { role: AI_ROLES.USER, content: userPrompt }
      ],
      temperature,
      max_tokens: maxTokens
    };

    try {
      const stream = await groqClient.chatCompletionStream(payload);
      
      let buffer = '';
      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep the last incomplete block in the buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          if (trimmed === 'data: [DONE]') {
            return;
          }

          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const token = data.choices?.[0]?.delta?.content;
              if (token) {
                yield token;
              }
            } catch (err) {
              // Ignore partial parsing errors on fragmented packets
            }
          }
        }
      }

      // Output any residual text
      if (buffer.startsWith('data: ')) {
        const trimmed = buffer.trim();
        if (trimmed !== 'data: [DONE]') {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const token = data.choices?.[0]?.delta?.content;
            if (token) {
              yield token;
            }
          } catch (err) {
            // Ignore residual errors
          }
        }
      }
    } catch (error) {
      logger.error('LLM streaming failed', { error: error.message });
      throw new ServiceError(
        'LLMService',
        `LLM streaming failed: ${error.message}`,
        'LLM_GENERATION_FAILED',
        error
      );
    }
  }

  /**
   * List available models
   * @returns {Object[]}
   */
  getModels() {
    return Object.keys(this.models).map(id => ({ id, ...this.models[id] }));
  }
}

module.exports = new LLMService();

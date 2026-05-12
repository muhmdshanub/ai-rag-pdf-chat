const axios = require('axios');
const logger = require('./logger');
const config = require('../config');

/**
 * Groq API Client
 * 
 * Handles low-level communication with Groq API.
 * Includes retry logic and standardized error handling.
 */
class GroqClient {
  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.groq.com/openai/v1',
      headers: {
        'Authorization': `Bearer ${config.groqApiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: config.extractionTimeout || 60000
    });

    this.maxRetries = 3;
  }

  /**
   * Call Chat Completion API
   * 
   * @param {Object} payload - OpenAI-compatible chat completion payload
   * @returns {Promise<Object>} API response data
   */
  async chatCompletion(payload) {
    return this._requestWithRetry(() => this.client.post('/chat/completions', payload));
  }

  /**
   * Internal request wrapper with exponential backoff retries
   * 
   * @private
   */
  async _requestWithRetry(requestFn, attempt = 1) {
    try {
      const response = await requestFn();
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      
      // Determine if error is retryable (429 Rate Limit or 5xx Server Error)
      const isRetryable = status === 429 || (status >= 500 && status <= 599);

      if (isRetryable && attempt < this.maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s...
        logger.warn(`Groq API error ${status}. Retrying in ${delay}ms... (Attempt ${attempt}/${this.maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._requestWithRetry(requestFn, attempt + 1);
      }

      // Final error handling
      this._handleApiError(error);
    }
  }

  /**
   * Map axios errors to domain-specific errors
   * 
   * @private
   */
  _handleApiError(error) {
    if (error.response) {
      const { status, data } = error.response;
      const message = data?.error?.message || error.message;

      logger.error(`Groq API Error [${status}]: ${message}`, { status, data });

      if (status === 401) throw new Error('Invalid Groq API Key');
      if (status === 429) throw new Error('Groq API Rate Limit Exceeded');
      
      throw new Error(`Groq API Error: ${message}`);
    }

    if (error.request) {
      logger.error('Groq API No Response Received', { message: error.message });
      throw new Error('Groq API unreachable');
    }

    throw error;
  }
}

module.exports = new GroqClient();

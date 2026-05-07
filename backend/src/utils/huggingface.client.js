const axios = require('axios');
const logger = require('./logger');
const config = require('../config');
const { ServiceError } = require('./errors');

/**
 * HuggingFace API Client
 * 
 * Encapsulates all HTTP transport logic, vendor-specific retries,
 * and authentication for HuggingFace APIs.
 */
class HuggingFaceClient {
  constructor() {
    this.client = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Make a POST request to a HuggingFace Inference endpoint
   * Handles 503 model cold starts and 429 rate limits automatically.
   * 
   * @param {string} url - Full endpoint URL
   * @param {object} data - Request payload
   * @param {number} attempt - Current retry attempt
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Promise<any>}
   */
  async post(url, data, attempt = 1, maxRetries = 3) {
    if (!config.huggingfaceApiKey) {
      throw new ServiceError(
        'HuggingFaceClient',
        'HUGGINGFACE_API_KEY is not configured',
        'MISSING_API_KEY'
      );
    }

    try {
      const response = await this.client.post(url, data, {
        headers: {
          Authorization: `Bearer ${config.huggingfaceApiKey}`,
        },
      });

      return response.data;
    } catch (error) {
      // 1. Handle 503 Service Unavailable (Model is cold and loading)
      if (error.response?.status === 503 && attempt < maxRetries) {
        const estimatedTime = error.response.data?.estimated_time || 20;
        logger.info(`HuggingFace model is loading. Waiting ${estimatedTime} seconds... (Attempt ${attempt}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, estimatedTime * 1000));
        return this.post(url, data, attempt + 1, maxRetries);
      }

      // 2. Handle 429 Too Many Requests (Rate limit)
      if (error.response?.status === 429 && attempt < maxRetries) {
        const backoffTime = 2000 * attempt;
        logger.warn(`HuggingFace rate limit exceeded. Backing off for ${backoffTime}ms... (Attempt ${attempt}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, backoffTime));
        return this.post(url, data, attempt + 1, maxRetries);
      }

      // 3. Out of retries or fatal error
      const message = error.response?.data?.error || error.message;
      throw new ServiceError(
        'HuggingFaceClient',
        `API request failed: ${message}`,
        'API_ERROR',
        error
      );
    }
  }
}

module.exports = new HuggingFaceClient();

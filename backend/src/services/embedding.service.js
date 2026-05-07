/**
 * Embedding Service
 *
 * Generates vector embeddings from text using HuggingFace Inference API.
 * Model: sentence-transformers/all-MiniLM-L6-v2 (384 dimensions)
 *
 * This is a pure service: no caching, no I/O, just API communication.
 */

const logger = require('../utils/logger');
const { ServiceError } = require('../utils/errors');
const config = require('../config');
const hfClient = require('../utils/huggingface.client');

class EmbeddingService {
  constructor() {
    this.apiUrl = config.huggingfaceApiUrl || 'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2';
    this.embeddingDimension = 384;
    this.batchSize = 32;
  }

  /**
   * Validate the returned embedding structure
   * @private
   */
  _validateEmbeddingOutput(embedding) {
    if (!Array.isArray(embedding) || embedding.length !== this.embeddingDimension) {
      throw new ServiceError(
        'Embedding',
        `Invalid embedding dimension. Expected ${this.embeddingDimension}, got ${embedding?.length}`,
        'INVALID_DIMENSION'
      );
    }
  }

  /**
   * Generate embedding for a single text
   * @param {string} text - Input text
   * @returns {Promise<number[]>} 384-dimensional vector
   */
  async getEmbedding(text) {
    if (!text || typeof text !== 'string') {
      throw new ServiceError('Embedding', 'Input must be a non-empty string', 'INVALID_INPUT');
    }

    logger.debug(`Generating embedding for text length: ${text.length}`);
    const result = await hfClient.post(this.apiUrl, { inputs: text });
    
    this._validateEmbeddingOutput(result);
    return result;
  }

  /**
   * Generate embeddings for multiple texts (batch)
   * @param {string[]} texts - Array of input texts
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async getEmbeddings(texts) {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new ServiceError('Embedding', 'Input must be a non-empty array', 'INVALID_INPUT');
    }

    logger.info(`Generating embeddings for ${texts.length} items`);
    const allEmbeddings = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      logger.debug(`Processing batch ${i / this.batchSize + 1} (${batch.length} items)`);
      
      const result = await hfClient.post(this.apiUrl, { inputs: batch });
      
      // result should be an array of arrays
      if (!Array.isArray(result) || result.length !== batch.length) {
        throw new ServiceError('Embedding', 'Batch API response shape mismatch', 'INVALID_BATCH_RESPONSE');
      }

      result.forEach(embedding => this._validateEmbeddingOutput(embedding));
      allEmbeddings.push(...result);
    }

    return allEmbeddings;
  }
}

module.exports = new EmbeddingService();

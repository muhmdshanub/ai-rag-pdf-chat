/**
 * Chunking Service
 *
 * Handles text chunking with configurable overlap and size.
 * Pure business logic: transforms text into chunks.
 * No I/O, no caching, no persistence.
 *
 * @module services/ChunkingService
 */

const logger = require('../utils/logger');
const { ServiceError } = require('../utils/errors');

class ChunkingService {
  constructor() {
    this.defaults = {
      chunkSize: 500,           // Characters per chunk
      overlapSize: 100,         // Character overlap between chunks
      minChunkSize: 50,         // Minimum chars for a valid chunk
      sentenceRegex: /[.!?]+/,  // Sentence boundaries
      wordRegex: /\s+/,         // Word boundaries
    };
  }

  /**
   * Chunk text into overlapping segments
   *
   * @async
   * @param {string} text - Raw text to chunk
   * @param {object} options - Chunking options
   * @throws {ServiceError} If text is invalid
   * @returns {Promise<array>} Array of chunk objects
   */
  async chunk(text, options = {}) {
    const startTime = Date.now();
    const {
      chunkSize = this.defaults.chunkSize,
      overlapSize = this.defaults.overlapSize,
      minChunkSize = this.defaults.minChunkSize
    } = options;

    try {
      this._validateInput(text, chunkSize, overlapSize, minChunkSize);

      logger.info('Text chunking started', {
        textLength: text.length,
        chunkSize,
        overlapSize
      });

      const normalized = this._normalizeText(text);
      const sentences = this._splitBySentences(normalized);
      const chunks = this._groupSentencesIntoChunks(sentences, chunkSize, overlapSize);

      const chunksWithMetadata = chunks
        .filter(chunk => chunk.text.length >= minChunkSize)
        .map((chunk, index) => ({
          text: chunk.text,
          index,
          position: chunk.position,
          statistics: {
            characters: chunk.text.length,
            words: chunk.text.split(/\s+/).filter(w => w.length > 0).length,
            sentences: (chunk.text.match(/[.!?]+/g) || []).length
          }
        }));

      const duration = Date.now() - startTime;

      logger.info('Text chunking completed', {
        inputLength: text.length,
        chunkCount: chunksWithMetadata.length,
        duration
      });

      return chunksWithMetadata;
    } catch (error) {
      logger.error('Chunking failed', {
        error: error.message,
        textLength: text?.length
      });

      if (error instanceof ServiceError) {
        throw error;
      }

      throw new ServiceError(
        'Chunking',
        `Failed to chunk text: ${error.message}`,
        'CHUNKING_FAILED',
        error
      );
    }
  }

  /**
   * Validate chunking parameters
   *
   * @private
   * @throws {ServiceError} If validation fails
   */
  _validateInput(text, chunkSize, overlapSize, minChunkSize) {
    if (!text || typeof text !== 'string') {
      throw new ServiceError('Chunking', 'Text must be a non-empty string', 'INVALID_TEXT');
    }
    if (text.length === 0) {
      throw new ServiceError('Chunking', 'Text is empty', 'EMPTY_TEXT');
    }
    if (chunkSize <= 0) {
      throw new ServiceError('Chunking', 'Chunk size must be positive', 'INVALID_CHUNK_SIZE');
    }
    if (overlapSize < 0 || overlapSize >= chunkSize) {
      throw new ServiceError('Chunking', 'Overlap must be between 0 and chunk size', 'INVALID_OVERLAP');
    }
    if (minChunkSize < 0) {
      throw new ServiceError('Chunking', 'Min chunk size must be non-negative', 'INVALID_MIN_SIZE');
    }
  }

  /**
   * Normalize text: fix line endings, remove excessive whitespace
   *
   * @private
   * @param {string} text - Raw text
   * @returns {string} Normalized text
   */
  _normalizeText(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  /**
   * Split text by sentence boundaries
   *
   * @private
   * @param {string} text - Normalized text
   * @returns {array} Array of sentences
   */
  _splitBySentences(text) {
    // Match sentences ending with . ! or ?, keep punctuation attached
    return text
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.length > 0);
  }

  /**
   * Group sentences into chunks respecting size limits
   * Maintains overlap between consecutive chunks
   *
   * @private
   * @param {array} sentences - Array of sentences
   * @param {number} chunkSize - Target chunk size
   * @param {number} overlapSize - Overlap size
   * @returns {array} Array of chunk objects with text and position
   */
  _groupSentencesIntoChunks(sentences, chunkSize, overlapSize) {
    const chunks = [];
    let currentChunkText = '';
    let currentChunkSize = 0;
    let charPosition = 0;

    for (const sentence of sentences) {
      const sentenceLength = sentence.length + 1; // +1 for space

      if (currentChunkSize + sentenceLength > chunkSize && currentChunkText.length > 0) {
        chunks.push({
          text: currentChunkText.trim(),
          position: charPosition - currentChunkSize
        });

        const overlapText = currentChunkText.slice(-overlapSize).trim();
        charPosition += currentChunkSize;

        currentChunkText = overlapText + ' ' + sentence;
        currentChunkSize = currentChunkText.length;
      } else {
        currentChunkText += (currentChunkText.length > 0 ? ' ' : '') + sentence;
        currentChunkSize = currentChunkText.length;
      }
    }

    if (currentChunkText.trim().length > 0) {
      chunks.push({
        text: currentChunkText.trim(),
        position: charPosition
      });
    }

    return chunks;
  }

  /**
   * Calculate optimal chunk size based on text length and document type
   * 
   * Larger documents get larger chunks (more efficient embedding)
   * Smaller documents get smaller chunks (better granularity)
   * 
   * @param {number} textLength - Total text length
   * @param {string} documentType - Type of document ('academic', 'technical', 'general')
   * @returns {number} Recommended chunk size
   */
  calculateOptimalChunkSize(textLength, documentType = 'general') {
    const baseSizes = {
      academic: 600,
      technical: 500,
      general: 400
    };

    const baseSize = baseSizes[documentType] || baseSizes.general;

    if (textLength < 5000) return Math.max(200, baseSize - 100);
    if (textLength < 50000) return baseSize;
    if (textLength < 200000) return baseSize + 100;
    return baseSize + 200;
  }

  /**
   * Get chunking statistics for monitoring/analysis
   * 
   * @param {array} chunks - Array of chunks
   * @returns {object} Statistics object
   */
  getChunkingStatistics(chunks) {
    if (!chunks || chunks.length === 0) {
      return {
        totalChunks: 0,
        totalCharacters: 0,
        totalWords: 0,
        averageChunkSize: 0,
        averageWordsPerChunk: 0,
        minChunkSize: 0,
        maxChunkSize: 0,
        overlapRatio: this.defaults.overlapSize / this.defaults.chunkSize
      };
    }

    const sizes = chunks.map(c => c.text.length);
    const totalChars = sizes.reduce((a, b) => a + b, 0);
    const totalWords = chunks.reduce((sum, chunk) => {
      const words = chunk.text.split(/\s+/).filter(w => w.length > 0);
      return sum + words.length;
    }, 0);

    return {
      totalChunks: chunks.length,
      totalCharacters: totalChars,
      totalWords,
      averageChunkSize: Math.round(totalChars / chunks.length),
      averageWordsPerChunk: Math.round(totalWords / chunks.length),
      minChunkSize: Math.min(...sizes),
      maxChunkSize: Math.max(...sizes),
      overlapRatio: this.defaults.overlapSize / this.defaults.chunkSize
    };
  }
}

module.exports = new ChunkingService();

/**
 * Chunking Service
 *
 * Splits extracted text into overlapping chunks for embedding.
 * Overlap ensures context continuity between chunks.
 */

const logger = require('../utils/logger');

class ChunkingService {
  constructor(chunkSize = 500, overlap = 100) {
    this.chunkSize = chunkSize;
    this.overlap = overlap;
  }

  /**
   * Split text into overlapping chunks
   * @param {string} text - Raw text to chunk
   * @returns {string[]} Array of text chunks
   */
  chunk(text) {
    // TODO: Implement sliding window chunking with sentence boundaries
    logger.info(`✂️ Chunking text (${text.length} chars)`);
    throw new Error('Chunking service not yet implemented');
  }

  /**
   * Chunk text and attach metadata
   * @param {string} text - Raw text
   * @param {object} metadata - Additional metadata per chunk
   * @returns {Array<{text: string, index: number}>}
   */
  chunkWithMetadata(text, metadata = {}) {
    const chunks = this.chunk(text);
    return chunks.map((chunk, index) => ({
      text: chunk,
      index,
      ...metadata,
    }));
  }
}

module.exports = new ChunkingService();

# 🔥 Phase 2b: Chunking Service - Enterprise Implementation Guide

## Overview

Phase 2b implements the **Chunking Service**, which transforms extracted PDF text into meaningful, overlapping chunks suitable for embedding and retrieval.

**Key Difference from Phase 2a:** Phase 2a extracted raw text. Phase 2b makes that text *semantically queryable* by breaking it into appropriately-sized pieces.

---

## 🏗️ Architecture & Design

### Service Responsibilities

```
ChunkingService (Layer 4: Services)
└── Input: Raw text from PDF
└── Process: Split into overlapping chunks
└── Output: Array of chunk objects with metadata
└── No caching, no persistence, no I/O
└── Single Responsibility: Chunking
```

### Where It Fits in the Pipeline

```
DocumentPipeline.process()
│
├─ StorageService.readFile()         ← Get file from disk
├─ PDFParserService.extractText()    ← Extract raw text
│
├─ ChunkingService.chunk()           ← NEW: Split text into chunks
│  └─ Input: { text, metadata }
│  └─ Output: [{ text, index, position }, ...]
│
├─ For each chunk:
│  └─ EmbeddingService.embed()       ← (Phase 2c) Convert to vectors
│  └─ ChunkModel.create()            ← Save chunks to DB
│
└─ DocumentModel.update()            ← Mark as 'completed'
```

### Data Flow

```
Raw PDF Text (145,000 chars)
       ↓
ChunkingService
       ↓
Chunks Array (90 items)
├─ Chunk 0: "Chapter 1: Introduction..." (500 chars)
├─ Chunk 1: "Introduction continued..." (520 chars)
│           [overlap with chunk 0: last 100 chars]
├─ Chunk 2: "Chapter 2: Getting Started..." (510 chars)
│           [overlap with chunk 1: last 100 chars]
└─ ...
       ↓
ChunkModel.createMany()
       ↓
PostgreSQL chunks table (90 rows)
```

---

## 📋 Implementation Plan

### Part 1: ChunkingService Implementation

**File:** `backend/src/services/chunking.service.js`

```javascript
/**
 * ChunkingService
 * 
 * Handles text chunking with configurable overlap and size.
 * Pure business logic: transforms text into chunks.
 * No I/O, no caching, no persistence.
 * 
 * @module services/ChunkingService
 */

const logger = require('../utils/logger');

/**
 * Custom error for chunking operations
 */
class ChunkingError extends Error {
  constructor(message, code = 'CHUNKING_ERROR') {
    super(message);
    this.name = 'ChunkingError';
    this.code = code;
  }
}

/**
 * ChunkingService
 * 
 * Splits text into overlapping chunks suitable for semantic search.
 * Uses sentence boundaries to avoid cutting mid-sentence.
 */
class ChunkingService {
  /**
   * Configuration defaults
   */
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
   * Algorithm:
   * 1. Normalize whitespace
   * 2. Split by sentences
   * 3. Group sentences into chunks (respecting chunkSize)
   * 4. Add overlap from previous chunk
   * 5. Filter out chunks below minChunkSize
   * 6. Add metadata (index, position, word count)
   * 
   * @async
   * @param {string} text - Raw text to chunk
   * @param {object} options - Chunking options
   * @param {number} options.chunkSize - Target chunk size in chars (default: 500)
   * @param {number} options.overlapSize - Overlap in chars (default: 100)
   * @param {number} options.minChunkSize - Minimum chunk size (default: 50)
   * @throws {ChunkingError} If text is invalid
   * @returns {Promise<array>} Array of chunk objects
   * @returns {string} returns[].text - Chunk text
   * @returns {number} returns[].index - Chunk index (0-based)
   * @returns {number} returns[].position - Character position in original text
   * @returns {object} returns[].statistics - Chunk statistics
   */
  async chunk(text, options = {}) {
    const startTime = Date.now();
    const {
      chunkSize = this.defaults.chunkSize,
      overlapSize = this.defaults.overlapSize,
      minChunkSize = this.defaults.minChunkSize
    } = options;

    try {
      // Validate input
      this._validateInput(text, chunkSize, overlapSize, minChunkSize);

      logger.info('Text chunking started', {
        textLength: text.length,
        chunkSize,
        overlapSize
      });

      // Normalize text
      const normalized = this._normalizeText(text);

      // Split into sentences
      const sentences = this._splitBySentences(normalized);

      // Group sentences into chunks
      const chunks = this._groupSentencesIntoChunks(
        sentences,
        chunkSize,
        overlapSize
      );

      // Add metadata to each chunk
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
        averageChunkSize: Math.round(
          text.length / chunksWithMetadata.length
        ),
        duration
      });

      return chunksWithMetadata;

    } catch (error) {
      logger.error('Chunking failed', {
        error: error.message,
        textLength: text?.length
      });

      if (error instanceof ChunkingError) {
        throw error;
      }

      throw new ChunkingError(
        `Failed to chunk text: ${error.message}`,
        'CHUNKING_FAILED'
      );
    }
  }

  /**
   * Validate chunking parameters
   * 
   * @private
   * @throws {ChunkingError} If validation fails
   */
  _validateInput(text, chunkSize, overlapSize, minChunkSize) {
    if (!text || typeof text !== 'string') {
      throw new ChunkingError('Text must be a non-empty string', 'INVALID_TEXT');
    }

    if (text.length === 0) {
      throw new ChunkingError('Text is empty', 'EMPTY_TEXT');
    }

    if (chunkSize <= 0) {
      throw new ChunkingError('Chunk size must be positive', 'INVALID_CHUNK_SIZE');
    }

    if (overlapSize < 0 || overlapSize >= chunkSize) {
      throw new ChunkingError(
        'Overlap must be between 0 and chunk size',
        'INVALID_OVERLAP'
      );
    }

    if (minChunkSize < 0) {
      throw new ChunkingError('Min chunk size must be non-negative', 'INVALID_MIN_SIZE');
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
      .replace(/\r\n/g, '\n')                    // Normalize line endings
      .replace(/\n{3,}/g, '\n\n')                // Remove excessive blank lines
      .replace(/[ \t]{2,}/g, ' ')                // Remove excessive spaces
      .trim();                                    // Remove leading/trailing whitespace
  }

  /**
   * Split text by sentence boundaries
   * Tries to preserve meaning by not cutting mid-sentence
   * 
   * @private
   * @param {string} text - Normalized text
   * @returns {array} Array of sentences
   */
  _splitBySentences(text) {
    // Match sentences ending with . ! or ?
    // But keep the punctuation attached
    const sentences = text
      .split(/(?<=[.!?])\s+/)  // Split on whitespace after sentence end
      .filter(s => s.length > 0);

    return sentences;
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
    let charPosition = 0;  // Track position in original text
    let overlapText = '';  // Text to overlap into next chunk

    for (const sentence of sentences) {
      const sentenceLength = sentence.length + 1; // +1 for space

      // If adding this sentence would exceed chunk size, save current chunk
      if (currentChunkSize + sentenceLength > chunkSize && currentChunkText.length > 0) {
        chunks.push({
          text: currentChunkText.trim(),
          position: charPosition - currentChunkSize
        });

        // Prepare overlap: take last overlapSize chars
        overlapText = currentChunkText.slice(-overlapSize).trim();
        charPosition += currentChunkSize;

        // Start new chunk with overlap
        currentChunkText = overlapText + ' ' + sentence;
        currentChunkSize = currentChunkText.length;
      } else {
        // Add sentence to current chunk
        currentChunkText += (currentChunkText.length > 0 ? ' ' : '') + sentence;
        currentChunkSize = currentChunkText.length;
      }
    }

    // Don't forget the last chunk
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
      academic: 600,      // Academic papers: larger chunks
      technical: 500,     // Technical docs: medium chunks
      general: 400        // General text: smaller chunks
    };

    const baseSize = baseSizes[documentType] || baseSizes.general;

    // Adjust based on document length
    if (textLength < 5000) return Math.max(200, baseSize - 100);    // Small docs: smaller chunks
    if (textLength < 50000) return baseSize;                        // Medium docs: standard
    if (textLength < 200000) return baseSize + 100;                 // Large docs: larger chunks
    return baseSize + 200;                                          // Huge docs: much larger chunks
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
        maxChunkSize: 0
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
```

---

### Part 2: ChunkingService Tests

**File:** `backend/src/services/chunking.service.test.js`

```javascript
/**
 * ChunkingService Tests
 * 
 * Tests the chunking algorithm for:
 * - Correct chunk creation
 * - Proper overlap
 * - Sentence boundary preservation
 * - Edge cases (empty text, tiny chunks, etc.)
 * - Statistics calculation
 */

const ChunkingService = require('./chunking.service');

describe('ChunkingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('chunk()', () => {
    it('should chunk text into appropriate sizes', async () => {
      const text = 'This is sentence one. This is sentence two. This is sentence three.';
      const result = await ChunkingService.chunk(text, {
        chunkSize: 50,
        overlapSize: 10
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('text');
      expect(result[0]).toHaveProperty('index');
      expect(result[0]).toHaveProperty('position');
      expect(result[0]).toHaveProperty('statistics');
    });

    it('should maintain overlap between chunks', async () => {
      const text = 'A. B. C. D. E. F. G. H. I. J. K. L. M. N. O. P. Q. R. S. T.';
      const result = await ChunkingService.chunk(text, {
        chunkSize: 30,
        overlapSize: 10
      });

      // Chunks should exist
      expect(result.length).toBeGreaterThan(1);

      // Check for overlap pattern
      for (let i = 0; i < result.length - 1; i++) {
        const currentChunk = result[i].text;
        const nextChunk = result[i + 1].text;
        
        // Last 10 chars of current chunk should appear in next chunk
        const overlapPart = currentChunk.slice(-10);
        expect(nextChunk).toContain(overlapPart);
      }
    });

    it('should preserve sentence boundaries', async () => {
      const text = 'First sentence. Second sentence. Third sentence.';
      const result = await ChunkingService.chunk(text, {
        chunkSize: 100,
        overlapSize: 10
      });

      result.forEach(chunk => {
        // No incomplete sentences
        expect(chunk.text).toMatch(/[.!?]$/);
      });
    });

    it('should throw error for invalid text', async () => {
      await expect(
        ChunkingService.chunk(null)
      ).rejects.toThrow('Text must be a non-empty string');

      await expect(
        ChunkingService.chunk('')
      ).rejects.toThrow('Text is empty');

      await expect(
        ChunkingService.chunk(123)
      ).rejects.toThrow('Text must be a non-empty string');
    });

    it('should throw error for invalid parameters', async () => {
      const text = 'Valid text.';

      await expect(
        ChunkingService.chunk(text, { chunkSize: 0 })
      ).rejects.toThrow('Chunk size must be positive');

      await expect(
        ChunkingService.chunk(text, { overlapSize: 100, chunkSize: 50 })
      ).rejects.toThrow('Overlap must be between 0 and chunk size');

      await expect(
        ChunkingService.chunk(text, { minChunkSize: -5 })
      ).rejects.toThrow('Min chunk size must be non-negative');
    });

    it('should filter out chunks below minChunkSize', async () => {
      const text = 'A. B. C. D. E. F. G. H.';
      const result = await ChunkingService.chunk(text, {
        chunkSize: 50,
        overlapSize: 10,
        minChunkSize: 5
      });

      result.forEach(chunk => {
        expect(chunk.text.length).toBeGreaterThanOrEqual(5);
      });
    });

    it('should add index and position metadata', async () => {
      const text = 'Sentence one. Sentence two. Sentence three.';
      const result = await ChunkingService.chunk(text);

      result.forEach((chunk, i) => {
        expect(chunk.index).toBe(i);
        expect(typeof chunk.position).toBe('number');
        expect(chunk.position).toBeGreaterThanOrEqual(0);
      });
    });

    it('should calculate chunk statistics', async () => {
      const text = 'This is a test. This is another test. Final test.';
      const result = await ChunkingService.chunk(text);

      result.forEach(chunk => {
        expect(chunk.statistics).toHaveProperty('characters');
        expect(chunk.statistics).toHaveProperty('words');
        expect(chunk.statistics).toHaveProperty('sentences');
        expect(chunk.statistics.characters).toBe(chunk.text.length);
      });
    });

    it('should handle very long text efficiently', async () => {
      const longText = 'Word. '.repeat(10000); // ~60KB
      const result = await ChunkingService.chunk(longText);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].text.length).toBeGreaterThan(0);
    });

    it('should handle text with mixed line endings', async () => {
      const mixedText = 'Line one.\r\nLine two.\nLine three.\r\nLine four.';
      const result = await ChunkingService.chunk(mixedText);

      // Should normalize and chunk correctly
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle text with excessive whitespace', async () => {
      const whitespaceText = 'Start.    Mid.    End.';
      const result = await ChunkingService.chunk(whitespaceText);

      result.forEach(chunk => {
        // No double spaces
        expect(chunk.text).not.toMatch(/  /);
      });
    });
  });

  describe('calculateOptimalChunkSize()', () => {
    it('should return smaller chunks for small documents', () => {
      const size = ChunkingService.calculateOptimalChunkSize(1000);
      expect(size).toBeLessThan(400);
    });

    it('should return standard chunks for medium documents', () => {
      const size = ChunkingService.calculateOptimalChunkSize(50000);
      expect(size).toBeGreaterThanOrEqual(400);
      expect(size).toBeLessThanOrEqual(600);
    });

    it('should return larger chunks for large documents', () => {
      const size = ChunkingService.calculateOptimalChunkSize(200000);
      expect(size).toBeGreaterThan(500);
    });

    it('should consider document type', () => {
      const academic = ChunkingService.calculateOptimalChunkSize(50000, 'academic');
      const technical = ChunkingService.calculateOptimalChunkSize(50000, 'technical');
      const general = ChunkingService.calculateOptimalChunkSize(50000, 'general');

      expect(academic).toBeGreaterThan(general);
      expect(technical).toBeGreaterThanOrEqual(general);
    });
  });

  describe('getChunkingStatistics()', () => {
    it('should calculate statistics for chunks', async () => {
      const text = 'First sentence. Second sentence. Third sentence.';
      const chunks = await ChunkingService.chunk(text);
      const stats = ChunkingService.getChunkingStatistics(chunks);

      expect(stats).toHaveProperty('totalChunks');
      expect(stats).toHaveProperty('totalCharacters');
      expect(stats).toHaveProperty('averageChunkSize');
      expect(stats.totalChunks).toBe(chunks.length);
    });

    it('should handle empty chunks array', () => {
      const stats = ChunkingService.getChunkingStatistics([]);
      expect(stats.totalChunks).toBe(0);
      expect(stats.averageChunkSize).toBe(0);
    });
  });
});
```

---

### Part 3: Update DocumentPipeline

**File:** `backend/src/pipelines/document.pipeline.js`

```javascript
/**
 * Add to existing DocumentPipeline
 */

const { storage, pdfParser, chunking, chunkModel, documentModel, cache, logger } = require('../registry');

class DocumentPipeline {
  // ... existing methods ...

  /**
   * Process a document end-to-end
   * 
   * Flow:
   * 1. Read file from storage
   * 2. Parse PDF to extract text
   * 3. Chunk the text
   * 4. (Phase 2c) Embed each chunk
   * 5. Save chunks to database
   * 6. Mark document as completed
   * 
   * @async
   * @param {number} documentId - Document ID to process
   * @throws {ServiceError} If processing fails
   */
  async process(documentId) {
    const startTime = Date.now();
    logger.info('Document processing started', { documentId });

    try {
      // Step 1: Get document
      const document = await documentModel.findById(documentId);
      if (!document) {
        throw new ServiceError('Document not found', 'NOT_FOUND');
      }

      // Step 2: Read file
      logger.info('Reading PDF file', { documentId, filePath: document.file_path });
      const fileBuffer = await storage.readFile(document.file_path);

      // Step 3: Parse PDF
      logger.info('Parsing PDF', { documentId });
      const { text, pages, metadata } = await pdfParser.extractText(fileBuffer);

      // Step 4: Chunk text (NEW in Phase 2b)
      logger.info('Chunking text', { documentId, textLength: text.length });
      const chunks = await chunking.chunk(text, {
        chunkSize: this._calculateOptimalChunkSize(text.length),
        overlapSize: 100,
        minChunkSize: 50
      });

      logger.info('Text chunked successfully', { 
        documentId, 
        chunkCount: chunks.length 
      });

      // Step 5: Save chunks to database
      logger.info('Saving chunks to database', { documentId, count: chunks.length });
      const savedChunkIds = [];
      
      for (const chunk of chunks) {
        const savedChunk = await chunkModel.create({
          document_id: documentId,
          chunk_index: chunk.index,
          text: chunk.text,
          position: chunk.position,
          // embedding will be added in Phase 2c
          metadata: JSON.stringify(chunk.statistics)
        });
        savedChunkIds.push(savedChunk.id);
      }

      // Step 6: Update document status
      logger.info('Updating document status', { documentId });
      await documentModel.update(documentId, {
        status: 'completed',
        total_chunks: chunks.length,
        processed_at: new Date()
      });

      const duration = Date.now() - startTime;

      logger.info('Document processing completed', {
        documentId,
        chunkCount: chunks.length,
        duration,
        avgChunkSize: Math.round(text.length / chunks.length)
      });

      return {
        success: true,
        documentId,
        chunkCount: chunks.length,
        duration
      };

    } catch (error) {
      logger.error('Document processing failed', {
        documentId,
        error: error.message,
        code: error.code
      });

      // Mark document as failed
      try {
        await documentModel.update(documentId, {
          status: 'failed',
          error_message: error.message
        });
      } catch (updateError) {
        logger.error('Failed to update document status', { updateError });
      }

      throw error;
    }
  }

  /**
   * Calculate optimal chunk size based on text length
   * @private
   */
  _calculateOptimalChunkSize(textLength) {
    if (textLength < 5000) return 300;
    if (textLength < 50000) return 500;
    if (textLength < 200000) return 600;
    return 800;
  }
}

module.exports = DocumentPipeline;
```

---

### Part 4: ChunkModel (Persistence Layer)

**File:** `backend/src/models/chunk.model.js`

```javascript
/**
 * ChunkModel
 * 
 * Handles chunk persistence and queries
 * Business rules: what makes a "valid" chunk, how to query chunks
 */

const { pool } = require('../config/database');
const ServiceError = require('../utils/error.service');
const logger = require('../utils/logger');

class ChunkModel {
  /**
   * Create a new chunk
   * 
   * @async
   * @param {object} data - Chunk data
   * @param {number} data.document_id - Document ID
   * @param {number} data.chunk_index - Chunk index
   * @param {string} data.text - Chunk text
   * @param {number} data.position - Position in original text
   * @param {string} data.metadata - Chunk metadata (JSON)
   * @throws {ServiceError} If creation fails
   * @returns {object} Created chunk
   */
  async create(data) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO chunks (document_id, chunk_index, text, position, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, document_id, chunk_index, text, position, metadata, created_at`,
        [
          data.document_id,
          data.chunk_index,
          data.text,
          data.position,
          data.metadata || null
        ]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Chunk creation failed', { error: error.message });
      throw new ServiceError(
        'Failed to create chunk',
        'CHUNK_CREATE_ERROR'
      );
    } finally {
      client.release();
    }
  }

  /**
   * Create multiple chunks (batch insert)
   * 
   * @async
   * @param {array} chunks - Array of chunk data
   * @throws {ServiceError} If creation fails
   * @returns {array} Created chunks
   */
  async createMany(chunks) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const results = [];
      for (const chunk of chunks) {
        const result = await client.query(
          `INSERT INTO chunks (document_id, chunk_index, text, position, metadata)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, document_id, chunk_index, text`,
          [
            chunk.document_id,
            chunk.chunk_index,
            chunk.text,
            chunk.position,
            chunk.metadata || null
          ]
        );
        results.push(result.rows[0]);
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Batch chunk creation failed', { error: error.message });
      throw new ServiceError(
        'Failed to create chunks',
        'CHUNKS_CREATE_ERROR'
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get chunks by document ID
   * 
   * @async
   * @param {number} documentId - Document ID
   * @returns {array} Chunks for the document
   */
  async findByDocumentId(documentId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM chunks 
         WHERE document_id = $1 
         ORDER BY chunk_index ASC`,
        [documentId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Failed to fetch chunks', { error: error.message });
      throw new ServiceError(
        'Failed to fetch chunks',
        'CHUNKS_FETCH_ERROR'
      );
    } finally {
      client.release();
    }
  }

  /**
   * Count chunks for a document
   * 
   * @async
   * @param {number} documentId - Document ID
   * @returns {number} Chunk count
   */
  async countByDocumentId(documentId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT COUNT(*) as count FROM chunks WHERE document_id = $1`,
        [documentId]
      );
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Failed to count chunks', { error: error.message });
      throw new ServiceError('Failed to count chunks', 'COUNT_ERROR');
    } finally {
      client.release();
    }
  }

  /**
   * Delete chunks for a document (when deleting document)
   * 
   * @async
   * @param {number} documentId - Document ID
   * @returns {number} Number of deleted chunks
   */
  async deleteByDocumentId(documentId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `DELETE FROM chunks WHERE document_id = $1`,
        [documentId]
      );
      return result.rowCount;
    } catch (error) {
      logger.error('Failed to delete chunks', { error: error.message });
      throw new ServiceError('Failed to delete chunks', 'DELETE_ERROR');
    } finally {
      client.release();
    }
  }
}

module.exports = new ChunkModel();
```

---

### Part 5: Update Registry

**File:** `backend/src/registry.js`

```javascript
/**
 * Add to existing registry
 */

// Services
const pdfParser = require('./services/pdf-parser.service');
const storage = require('./services/storage.service');
const cache = require('./services/cache.service');
const chunking = require('./services/chunking.service'); // NEW

// Models
const documentModel = require('./models/document.model');
const chunkModel = require('./models/chunk.model'); // NEW
const chatMessage = require('./models/chat-message.model');

// Pipelines
const DocumentPipeline = require('./pipelines/document.pipeline');

module.exports = {
  // Services
  pdfParser,
  storage,
  cache,
  chunking,  // NEW

  // Models
  documentModel,
  chunkModel,  // NEW
  chatMessage,

  // Pipelines
  DocumentPipeline: new DocumentPipeline(),

  logger: require('./utils/logger'),
  errors: require('./utils/error.service')
};
```

---

### Part 6: Database Migration (if needed)

**File:** `backend/src/db/migrations/002_add_chunk_metadata.sql`

```sql
-- If chunks table exists but needs metadata field
ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- If chunks table doesn't exist (shouldn't be case if Phase 2a done)
-- But included for completeness

CREATE TABLE IF NOT EXISTS chunks (
  id SERIAL PRIMARY KEY,
  document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  text TEXT NOT NULL,
  position INT,                    -- Character position in original text
  embedding vector(384),           -- Will be filled in Phase 2c
  metadata JSONB,                  -- Chunk statistics as JSON
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks USING ivfflat(embedding vector_cosine_ops);
```

---

## 🧪 Testing Strategy for Phase 2b

### Unit Tests (ChunkingService)
```bash
npm test -- chunking.service.test.js

# Should pass:
✅ Text chunks into appropriate sizes
✅ Maintains overlap between chunks
✅ Preserves sentence boundaries
✅ Handles invalid text
✅ Filters by minimum chunk size
✅ Calculates optimal chunk size
✅ Handles very long documents
✅ Normalizes whitespace
```

### Integration Tests
```bash
# Test full pipeline: PDF → Text → Chunks
npm test -- document.pipeline.test.js

# Should pass:
✅ End-to-end document processing
✅ Chunks saved to database
✅ Document status updated
✅ Error handling and rollback
```

### Manual Testing
```bash
# 1. Upload a PDF (Phase 2a already tested)
curl -F "file=@sample.pdf" http://localhost:5000/api/upload

# 2. Wait for processing to complete
# (logs should show chunking step)

# 3. Verify chunks in database
docker exec -it rag_chat_postgres psql -U dev -d rag_chat
SELECT COUNT(*) FROM chunks;
SELECT * FROM chunks LIMIT 3;

# 4. Verify statistics
SELECT 
  COUNT(*) as chunk_count,
  AVG(LENGTH(text)) as avg_chunk_size,
  MIN(LENGTH(text)) as min_chunk_size,
  MAX(LENGTH(text)) as max_chunk_size
FROM chunks
WHERE document_id = 1;
```

---

## ✅ Phase 2b Completion Checklist

- [ ] ChunkingService implemented (700+ lines)
- [ ] ChunkingService tests written (30+ test cases)
- [ ] All tests passing ✅
- [ ] ChunkModel created with CRUD operations
- [ ] DocumentPipeline updated to call ChunkingService
- [ ] Registry updated with new services/models
- [ ] Database migrations applied
- [ ] Manual end-to-end test successful
- [ ] Logging working properly
- [ ] Error handling tested
- [ ] Documentation updated

---

## 🚀 What's Next (Phase 2c)

After Phase 2b is complete:

**Phase 2c: Embedding Service**
- Converts chunk text → 384-dimensional vectors
- Calls HuggingFace API
- Stores embeddings in PostgreSQL (pgvector)
- Caches results in Redis
- Updates chunks table with `embedding` field

**Same pattern:**
1. Create EmbeddingService (pure logic)
2. Create embedding validation schema
3. Update DocumentPipeline
4. Add tests
5. Done!

---

## 📊 Phase 2b Success Metrics

| Metric | Target | Method |
|--------|--------|--------|
| Test Coverage | 95%+ | npm test -- --coverage |
| Chunk Overlap | 100% | Visual inspection + test |
| Sentence Preservation | 100% | Test verification |
| Performance | <1s for 100k chars | Benchmark test |
| Database Insertion | <5ms per chunk | Performance monitoring |
| Error Handling | 100% | Error test coverage |

---

## 💡 Key Differences from Phase 2a

| Aspect | Phase 2a (PDF Parser) | Phase 2b (Chunking) |
|--------|--------|--------|
| Input | File path | Text string |
| Output | `{text, pages, metadata}` | `[{text, index, position, stats}]` |
| I/O | File system | None (pure logic) |
| Caching | Via CacheService | None needed |
| Complexity | Medium | Low |
| Dependencies | Storage, Cache | None! |
| Focus | Extraction | Transformation |

**Phase 2b is actually simpler than Phase 2a because:**
- No I/O operations
- No external dependencies
- Pure business logic transformation
- Easy to test
- Easy to understand

---

This is your complete Phase 2b implementation guide following the improved architecture!

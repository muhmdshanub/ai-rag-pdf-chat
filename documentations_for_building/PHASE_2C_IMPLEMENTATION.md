# 🔥 Phase 2c: Embedding Service - Enterprise Implementation Guide

## Overview

Phase 2c implements the **Embedding Service**, which transforms text chunks into dense vector representations (embeddings) suitable for semantic similarity search and RAG retrieval.

**Key Responsibility:** Convert text → 384-dimensional vectors using HuggingFace Inference API

**Why Embeddings Matter:**
- Enable semantic search (find similar chunks by meaning, not keywords)
- Foundation for RAG retrieval (find relevant context for LLM)
- Core technology behind modern AI search systems

---

## 🏗️ Architecture & Design

### Service Responsibilities

```
EmbeddingService (Layer 4: Services)
├── Input: Text string
├── Process: Call HuggingFace API
├── Output: Float32Array (384 dimensions)
├── Error Handling: API failures, timeouts, rate limiting
├── Caching: Via CacheService (critical for performance)
└── Single Responsibility: Text → Vector conversion
```

### Where It Fits in the Pipeline

```
DocumentPipeline.process()
│
├─ StorageService.readFile()              ← Get file from disk
├─ PDFParserService.extractText()         ← Extract raw text
├─ ChunkingService.chunk()                ← Split into chunks
│
├─ For each chunk:
│  │
│  ├─ CacheService.getEmbedding()         ← Check cache first
│  │  └─ If cached: return immediately
│  │
│  ├─ EmbeddingService.embed()            ← NEW: Text → Vector
│  │  └─ Call HuggingFace API
│  │
│  ├─ CacheService.setEmbedding()         ← Store in Redis
│  │
│  └─ ChunkModel.update()                 ← Save vector to DB
│
└─ DocumentModel.update()                 ← Mark as 'completed'
```

### Data Flow

```
Chunk Text: "Kubernetes is a container orchestration platform..."
      ↓
EmbeddingService.embed(text)
      ↓
HuggingFace Inference API
      ↓
Vector: [0.234, -0.567, 0.891, ..., 0.123]  (384 numbers)
      ↓
CacheService.setEmbedding(text, vector)
      ↓
ChunkModel.update(chunkId, embedding)
      ↓
PostgreSQL chunks table
└─ embedding column: vector(384)
```

### Performance Optimization Strategy

```
Request text embedding for chunk #5
      ↓
┌─────────────────────────────────────┐
│ Check Redis cache                   │
│ Key: embedding:sha256(text)         │
└─────────────────────────────────────┘
      ↓
   ┌──────────┬──────────┐
   │          │          │
  HIT        MISS       HIT
   │          │          │
   ↓          ↓          │
Return  Call API         ↓
from    (1-2 sec)    Return from
cache   │             cache
(< 1ms) │             (< 1ms)
        ↓
   Store in Redis
   (TTL: 24h)
        ↓
   Return to caller
```

---

## 📋 Implementation Plan

### Part 1: EmbeddingService Implementation

**File:** `backend/src/services/embedding.service.js`

```javascript
/**
 * EmbeddingService
 * 
 * Transforms text into dense vector embeddings for semantic search.
 * Uses HuggingFace Inference API with Redis caching for performance.
 * 
 * @module services/EmbeddingService
 */

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Custom error for embedding operations
 */
class EmbeddingError extends Error {
  constructor(message, code = 'EMBEDDING_ERROR', statusCode = 500) {
    super(message);
    this.name = 'EmbeddingError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * EmbeddingService
 * 
 * Generates text embeddings using HuggingFace Inference API.
 * Implements caching via external CacheService (Redis).
 * Handles rate limiting, timeouts, and retries.
 */
class EmbeddingService {
  constructor() {
    // Configuration
    this.apiKey = process.env.HUGGINGFACE_API_KEY;
    this.apiUrl = 'https://api-inference.huggingface.co/pipeline/feature-extraction';
    this.model = 'sentence-transformers/all-MiniLM-L6-v2';
    
    // Performance
    this.timeout = parseInt(process.env.EMBEDDING_TIMEOUT || '30000'); // 30 seconds
    this.maxRetries = 3;
    this.retryDelay = 1000; // ms
    
    // Dimensions for model
    this.embeddingDimension = 384;
    
    // Batch settings
    this.batchSize = 32; // Max texts to embed at once
    this.batchTimeout = 5000; // ms
  }

  /**
   * Validate service configuration
   * 
   * @throws {EmbeddingError} If not properly configured
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new EmbeddingError(
        'HUGGINGFACE_API_KEY not configured',
        'MISSING_API_KEY',
        500
      );
    }

    if (!this.apiKey.startsWith('hf_')) {
      logger.warn('Invalid HuggingFace API key format');
    }
  }

  /**
   * Embed a single text
   * 
   * Algorithm:
   * 1. Validate input
   * 2. Check cache (via dependency injection)
   * 3. If cached: return immediately
   * 4. Call HuggingFace API with retry logic
   * 5. Validate output
   * 6. Cache result
   * 7. Return embedding
   * 
   * @async
   * @param {string} text - Text to embed
   * @param {object} options - Embedding options
   * @param {object} options.cache - CacheService instance (dependency injection)
   * @param {boolean} options.useCache - Use caching (default: true)
   * @param {number} options.timeout - Timeout in ms (default: 30000)
   * @throws {EmbeddingError} If embedding fails
   * @returns {Promise<object>} Embedding result
   * @returns {array} returns.embedding - 384-dimensional vector
   * @returns {boolean} returns.cached - Whether result was from cache
   * @returns {number} returns.dimensions - Vector dimensions
   * @returns {number} returns.duration - Time taken in ms
   */
  async embed(text, options = {}) {
    const startTime = Date.now();
    const {
      cache = null,
      useCache = true,
      timeout = this.timeout
    } = options;

    const logContext = {
      method: 'embed',
      textLength: text?.length,
      cached: false
    };

    try {
      // Validate input
      this._validateText(text);

      logger.debug('Embedding text', logContext);

      // Step 1: Check cache if enabled
      if (useCache && cache) {
        const cachedResult = await this._getCachedEmbedding(text, cache);
        if (cachedResult) {
          const duration = Date.now() - startTime;
          logger.debug('Embedding retrieved from cache', {
            ...logContext,
            cached: true,
            duration
          });
          return {
            embedding: cachedResult,
            cached: true,
            dimensions: this.embeddingDimension,
            duration
          };
        }
      }

      // Step 2: Call API with retries
      logger.debug('Calling HuggingFace API', logContext);
      const embedding = await this._callHFAPIWithRetry(text, timeout);

      // Step 3: Validate output
      this._validateEmbedding(embedding);

      // Step 4: Cache result
      if (useCache && cache) {
        try {
          await this._cacheEmbedding(text, embedding, cache);
        } catch (cacheError) {
          // Fail-open: caching failure doesn't crash the process
          logger.warn('Failed to cache embedding', { 
            error: cacheError.message 
          });
        }
      }

      const duration = Date.now() - startTime;

      logger.debug('Embedding completed', {
        ...logContext,
        duration,
        cached: false
      });

      return {
        embedding,
        cached: false,
        dimensions: this.embeddingDimension,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof EmbeddingError) {
        logger.error('Embedding failed', {
          ...logContext,
          error: error.code,
          message: error.message,
          duration
        });
        throw error;
      }

      logger.error('Unexpected embedding error', {
        ...logContext,
        error: error.message,
        duration,
        stack: error.stack
      });

      throw new EmbeddingError(
        `Failed to embed text: ${error.message}`,
        'EMBEDDING_FAILED',
        500
      );
    }
  }

  /**
   * Embed multiple texts (batch processing)
   * 
   * More efficient than calling embed() multiple times.
   * 
   * @async
   * @param {array} texts - Array of texts to embed
   * @param {object} options - Options (same as embed)
   * @throws {EmbeddingError} If any embedding fails
   * @returns {Promise<array>} Array of embedding results
   */
  async embedBatch(texts, options = {}) {
    const startTime = Date.now();
    const { cache = null, useCache = true, timeout = this.timeout } = options;

    logger.info('Batch embedding started', {
      count: texts.length,
      method: 'embedBatch'
    });

    try {
      // Validate all texts
      texts.forEach(text => this._validateText(text));

      // Split into batches if needed
      const batches = this._splitIntoBatches(texts, this.batchSize);
      const results = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        logger.debug(`Processing batch ${i + 1}/${batches.length}`, {
          batchSize: batch.length
        });

        // Check cache for each text
        const embeddings = [];
        const uncachedTexts = [];
        const uncachedIndices = [];

        for (let j = 0; j < batch.length; j++) {
          const text = batch[j];
          
          if (useCache && cache) {
            const cached = await this._getCachedEmbedding(text, cache);
            if (cached) {
              embeddings[j] = { embedding: cached, cached: true };
              continue;
            }
          }

          uncachedTexts.push(text);
          uncachedIndices.push(j);
        }

        // Call API for uncached texts
        if (uncachedTexts.length > 0) {
          const apiEmbeddings = await this._callHFAPIBatch(uncachedTexts, timeout);

          // Validate and cache
          for (let j = 0; j < apiEmbeddings.length; j++) {
            const embedding = apiEmbeddings[j];
            this._validateEmbedding(embedding);

            const idx = uncachedIndices[j];
            embeddings[idx] = { embedding, cached: false };

            // Cache it
            if (useCache && cache) {
              try {
                await this._cacheEmbedding(uncachedTexts[j], embedding, cache);
              } catch (cacheError) {
                logger.warn('Failed to cache embedding', { error: cacheError.message });
              }
            }
          }
        }

        // Add to results
        results.push(...embeddings);
      }

      const duration = Date.now() - startTime;
      const cachedCount = results.filter(r => r.cached).length;

      logger.info('Batch embedding completed', {
        count: texts.length,
        cached: cachedCount,
        duration,
        avgTime: Math.round(duration / texts.length)
      });

      return results;

    } catch (error) {
      logger.error('Batch embedding failed', {
        count: texts.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Call HuggingFace API with retry logic
   * 
   * @private
   * @async
   * @param {string} text - Text to embed
   * @param {number} timeout - Request timeout
   * @throws {EmbeddingError} If all retries fail
   * @returns {Promise<array>} Embedding vector
   */
  async _callHFAPIWithRetry(text, timeout) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.debug(`API call attempt ${attempt}/${this.maxRetries}`, {
          textLength: text.length
        });

        const result = await this._callHFAPI(text, timeout);
        return result;

      } catch (error) {
        logger.warn(`API call failed (attempt ${attempt})`, {
          error: error.message,
          code: error.code
        });

        // Don't retry on client errors (4xx)
        if (error.statusCode >= 400 && error.statusCode < 500) {
          throw error;
        }

        // Exponential backoff before retry
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          logger.debug(`Waiting ${delay}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Call HuggingFace API for single text
   * 
   * @private
   * @async
   * @param {string} text - Text to embed
   * @param {number} timeout - Request timeout
   * @throws {EmbeddingError} If API call fails
   * @returns {Promise<array>} Embedding vector
   */
  async _callHFAPI(text, timeout) {
    try {
      const response = await Promise.race([
        axios.post(
          this.apiUrl,
          { inputs: text },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout
          }
        ),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('API request timeout')), timeout)
        )
      ]);

      // HuggingFace returns array of arrays
      // For single text: [[emb1, emb2, ...]]
      // We want: [emb1, emb2, ...]
      const embedding = Array.isArray(response.data[0])
        ? response.data[0]
        : response.data;

      return embedding;

    } catch (error) {
      if (error.response?.status === 429) {
        throw new EmbeddingError(
          'HuggingFace API rate limit exceeded',
          'RATE_LIMITED',
          429
        );
      }

      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new EmbeddingError(
          'Invalid HuggingFace API key',
          'INVALID_API_KEY',
          401
        );
      }

      throw new EmbeddingError(
        `HuggingFace API error: ${error.message}`,
        'API_ERROR',
        error.response?.status || 500
      );
    }
  }

  /**
   * Call HuggingFace API for batch of texts
   * 
   * @private
   * @async
   * @param {array} texts - Texts to embed
   * @param {number} timeout - Request timeout
   * @throws {EmbeddingError} If API call fails
   * @returns {Promise<array>} Array of embedding vectors
   */
  async _callHFAPIBatch(texts, timeout) {
    try {
      const response = await Promise.race([
        axios.post(
          this.apiUrl,
          { inputs: texts },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout
          }
        ),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('API request timeout')), timeout)
        )
      ]);

      // HuggingFace batch returns array of vectors
      return response.data;

    } catch (error) {
      if (error.response?.status === 429) {
        throw new EmbeddingError(
          'HuggingFace API rate limit exceeded',
          'RATE_LIMITED',
          429
        );
      }

      throw new EmbeddingError(
        `HuggingFace batch API error: ${error.message}`,
        'BATCH_API_ERROR',
        500
      );
    }
  }

  /**
   * Get embedding from cache
   * 
   * @private
   * @async
   * @param {string} text - Text to look up
   * @param {object} cache - CacheService instance
   * @returns {Promise<array|null>} Cached embedding or null
   */
  async _getCachedEmbedding(text, cache) {
    try {
      const key = this._generateCacheKey(text);
      const cached = await cache.get(key);
      
      if (cached) {
        // Parse from JSON
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      logger.warn('Cache lookup failed', { error: error.message });
      return null; // Fail-open: return null, not error
    }
  }

  /**
   * Store embedding in cache
   * 
   * @private
   * @async
   * @param {string} text - Original text
   * @param {array} embedding - Embedding vector
   * @param {object} cache - CacheService instance
   * @returns {Promise<void>}
   */
  async _cacheEmbedding(text, embedding, cache) {
    try {
      const key = this._generateCacheKey(text);
      const value = JSON.stringify(embedding);
      const ttl = 86400; // 24 hours

      await cache.set(key, value, ttl);
    } catch (error) {
      // Fail-open: caching errors don't crash the process
      logger.warn('Failed to cache embedding', { error: error.message });
    }
  }

  /**
   * Generate cache key for text
   * Uses SHA256 of text + length for uniqueness
   * 
   * @private
   * @param {string} text - Text to hash
   * @returns {string} Cache key
   */
  _generateCacheKey(text) {
    const hash = crypto
      .createHash('sha256')
      .update(text)
      .digest('hex');
    
    return `embedding:${hash}`;
  }

  /**
   * Validate text input
   * 
   * @private
   * @throws {EmbeddingError} If validation fails
   */
  _validateText(text) {
    if (!text || typeof text !== 'string') {
      throw new EmbeddingError(
        'Text must be a non-empty string',
        'INVALID_TEXT',
        400
      );
    }

    if (text.length === 0) {
      throw new EmbeddingError(
        'Text is empty',
        'EMPTY_TEXT',
        400
      );
    }

    // HuggingFace has a length limit (typically 512 tokens ~ 2000 chars)
    if (text.length > 10000) {
      logger.warn('Text exceeds recommended length', {
        length: text.length
      });
    }
  }

  /**
   * Validate embedding output
   * 
   * @private
   * @throws {EmbeddingError} If validation fails
   */
  _validateEmbedding(embedding) {
    if (!Array.isArray(embedding)) {
      throw new EmbeddingError(
        'Embedding must be an array',
        'INVALID_EMBEDDING_FORMAT',
        500
      );
    }

    if (embedding.length !== this.embeddingDimension) {
      throw new EmbeddingError(
        `Embedding must be ${this.embeddingDimension} dimensions, got ${embedding.length}`,
        'INVALID_EMBEDDING_DIM',
        500
      );
    }

    // Check all values are numbers
    if (!embedding.every(val => typeof val === 'number')) {
      throw new EmbeddingError(
        'Embedding contains non-numeric values',
        'INVALID_EMBEDDING_VALUES',
        500
      );
    }
  }

  /**
   * Split texts into batches
   * 
   * @private
   * @param {array} texts - All texts
   * @param {number} batchSize - Texts per batch
   * @returns {array} Array of batches
   */
  _splitIntoBatches(texts, batchSize) {
    const batches = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Get service health and configuration info
   * 
   * @returns {object} Service info
   */
  getServiceInfo() {
    return {
      name: 'EmbeddingService',
      status: this.apiKey ? 'configured' : 'not_configured',
      model: this.model,
      dimensions: this.embeddingDimension,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      batchSize: this.batchSize
    };
  }
}

module.exports = new EmbeddingService();
```

---

### Part 2: EmbeddingService Tests

**File:** `backend/src/services/embedding.service.test.js`

```javascript
/**
 * EmbeddingService Tests
 * 
 * Tests embedding generation with:
 * - Real HuggingFace API calls (mocked in tests)
 * - Cache hit/miss scenarios
 * - Error handling and retries
 * - Batch processing
 * - Input validation
 * - Output validation
 */

const EmbeddingService = require('./embedding.service');
const axios = require('axios');

// Mock axios
jest.mock('axios');

// Mock cache service
const mockCache = {
  get: jest.fn(),
  set: jest.fn()
};

describe('EmbeddingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HUGGINGFACE_API_KEY = 'hf_testkey123456';
  });

  describe('embed()', () => {
    it('should embed text successfully', async () => {
      const text = 'This is a test sentence for embedding.';
      const mockEmbedding = new Array(384).fill(0).map(() => Math.random());

      axios.post.mockResolvedValue({
        data: [mockEmbedding]
      });

      const result = await EmbeddingService.embed(text, { cache: null });

      expect(result).toHaveProperty('embedding');
      expect(result).toHaveProperty('cached');
      expect(result).toHaveProperty('dimensions');
      expect(result).toHaveProperty('duration');
      expect(result.dimensions).toBe(384);
      expect(result.cached).toBe(false);
      expect(axios.post).toHaveBeenCalled();
    });

    it('should return cached embedding on second call', async () => {
      const text = 'Cached embedding test.';
      const mockEmbedding = new Array(384).fill(0).map(() => Math.random());

      // First call: API
      axios.post.mockResolvedValue({
        data: [mockEmbedding]
      });

      mockCache.get.mockResolvedValue(JSON.stringify(mockEmbedding));
      mockCache.set.mockResolvedValue();

      // First call
      const result1 = await EmbeddingService.embed(text, { 
        cache: mockCache,
        useCache: true 
      });
      expect(result1.cached).toBe(false);

      // Reset mock count
      axios.post.mockClear();

      // Second call (from cache)
      mockCache.get.mockResolvedValue(JSON.stringify(mockEmbedding));
      const result2 = await EmbeddingService.embed(text, { 
        cache: mockCache,
        useCache: true 
      });
      expect(result2.cached).toBe(true);
      expect(axios.post).not.toHaveBeenCalled(); // No API call
    });

    it('should throw error for invalid text', async () => {
      await expect(
        EmbeddingService.embed(null)
      ).rejects.toThrow('Text must be a non-empty string');

      await expect(
        EmbeddingService.embed('')
      ).rejects.toThrow('Text is empty');

      await expect(
        EmbeddingService.embed(123)
      ).rejects.toThrow('Text must be a non-empty string');
    });

    it('should handle API rate limiting with retries', async () => {
      const text = 'Rate limit test.';
      
      // Fail twice, succeed on third
      axios.post
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValueOnce({
          data: [new Array(384).fill(0.5)]
        });

      const result = await EmbeddingService.embed(text, { cache: null });
      
      expect(result.embedding).toBeDefined();
      expect(axios.post).toHaveBeenCalledTimes(3);
    });

    it('should fail on invalid API key', async () => {
      const text = 'Test text.';

      axios.post.mockRejectedValue({
        response: { status: 401 }
      });

      await expect(
        EmbeddingService.embed(text, { cache: null })
      ).rejects.toThrow('Invalid HuggingFace API key');
    });

    it('should timeout on slow API', async () => {
      const text = 'Timeout test.';

      axios.post.mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(resolve, 40000) // Longer than timeout
        )
      );

      const promise = EmbeddingService.embed(text, {
        cache: null,
        timeout: 1000
      });

      await expect(promise).rejects.toThrow();
    }, 10000);

    it('should validate embedding dimensions', async () => {
      const text = 'Dimension test.';

      // Return wrong dimensions
      axios.post.mockResolvedValue({
        data: [new Array(256).fill(0)] // Wrong size
      });

      await expect(
        EmbeddingService.embed(text, { cache: null })
      ).rejects.toThrow('384 dimensions');
    });

    it('should fail gracefully if caching fails', async () => {
      const text = 'Cache failure test.';
      const mockEmbedding = new Array(384).fill(0.5);

      axios.post.mockResolvedValue({
        data: [mockEmbedding]
      });

      mockCache.set.mockRejectedValue(new Error('Cache error'));

      // Should still return embedding despite cache failure
      const result = await EmbeddingService.embed(text, { 
        cache: mockCache,
        useCache: true 
      });

      expect(result.embedding).toEqual(mockEmbedding);
      expect(result.cached).toBe(false);
    });

    it('should skip cache if disabled', async () => {
      const text = 'No cache test.';
      const mockEmbedding = new Array(384).fill(0.5);

      axios.post.mockResolvedValue({
        data: [mockEmbedding]
      });

      mockCache.get.mockResolvedValue(JSON.stringify(mockEmbedding));

      const result = await EmbeddingService.embed(text, {
        cache: mockCache,
        useCache: false
      });

      expect(result.cached).toBe(false);
      expect(mockCache.get).not.toHaveBeenCalled();
    });
  });

  describe('embedBatch()', () => {
    it('should embed multiple texts', async () => {
      const texts = [
        'First text.',
        'Second text.',
        'Third text.'
      ];

      const mockEmbeddings = [
        new Array(384).fill(0.5),
        new Array(384).fill(0.6),
        new Array(384).fill(0.7)
      ];

      axios.post.mockResolvedValue({
        data: mockEmbeddings
      });

      const result = await EmbeddingService.embedBatch(texts, { cache: null });

      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('embedding');
      expect(result[0]).toHaveProperty('cached');
      result.forEach(item => {
        expect(item.embedding.length).toBe(384);
      });
    });

    it('should use cache for batch processing', async () => {
      const texts = ['First.', 'Second.', 'Third.'];
      const mockEmbedding = new Array(384).fill(0.5);

      // Cache has first embedding
      mockCache.get
        .mockResolvedValueOnce(JSON.stringify(mockEmbedding)) // First text cached
        .mockResolvedValueOnce(null) // Second text not cached
        .mockResolvedValueOnce(null); // Third text not cached

      axios.post.mockResolvedValue({
        data: [
          new Array(384).fill(0.6),
          new Array(384).fill(0.7)
        ]
      });

      const result = await EmbeddingService.embedBatch(texts, { 
        cache: mockCache 
      });

      expect(result[0].cached).toBe(true);
      expect(result[1].cached).toBe(false);
      expect(result[2].cached).toBe(false);
    });

    it('should split large batches', async () => {
      const texts = Array(100).fill('Test text.');
      const mockEmbedding = new Array(384).fill(0.5);

      axios.post.mockResolvedValue({
        data: Array(100).fill(mockEmbedding)
      });

      const result = await EmbeddingService.embedBatch(texts, { cache: null });

      expect(result).toHaveLength(100);
      // Should have made multiple API calls due to batch size
      expect(axios.post.mock.calls.length).toBeGreaterThan(1);
    });

    it('should throw error if any text is invalid', async () => {
      const texts = ['Valid.', null, 'Also valid.'];

      await expect(
        EmbeddingService.embedBatch(texts, { cache: null })
      ).rejects.toThrow('Text must be a non-empty string');
    });
  });

  describe('Service configuration', () => {
    it('should validate configuration', () => {
      expect(() => {
        EmbeddingService.validateConfig();
      }).not.toThrow();
    });

    it('should throw if API key missing', () => {
      delete process.env.HUGGINGFACE_API_KEY;
      
      expect(() => {
        EmbeddingService.validateConfig();
      }).toThrow('HUGGINGFACE_API_KEY');
    });

    it('should return service info', () => {
      const info = EmbeddingService.getServiceInfo();

      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('status');
      expect(info).toHaveProperty('model');
      expect(info).toHaveProperty('dimensions');
      expect(info.dimensions).toBe(384);
    });
  });

  describe('Cache key generation', () => {
    it('should generate consistent cache keys', () => {
      const text = 'Same text';
      const key1 = EmbeddingService._generateCacheKey(text);
      const key2 = EmbeddingService._generateCacheKey(text);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^embedding:/);
    });

    it('should generate different keys for different texts', () => {
      const key1 = EmbeddingService._generateCacheKey('Text one');
      const key2 = EmbeddingService._generateCacheKey('Text two');

      expect(key1).not.toBe(key2);
    });
  });

  describe('Performance', () => {
    it('should return cached results quickly', async () => {
      const text = 'Performance test.';
      const mockEmbedding = new Array(384).fill(0.5);

      mockCache.get.mockResolvedValue(JSON.stringify(mockEmbedding));

      const start = Date.now();
      await EmbeddingService.embed(text, { 
        cache: mockCache,
        useCache: true 
      });
      const duration = Date.now() - start;

      // Cache hit should be < 10ms
      expect(duration).toBeLessThan(10);
    });
  });
});
```

---

### Part 3: Update DocumentPipeline

**File:** `backend/src/pipelines/document.pipeline.js`

```javascript
/**
 * Update DocumentPipeline to call EmbeddingService
 */

const { 
  storage, 
  pdfParser, 
  chunking, 
  embedding,     // NEW
  chunkModel, 
  documentModel, 
  cache,         // For embedding cache
  logger 
} = require('../registry');

class DocumentPipeline {
  // ... existing methods ...

  /**
   * Process a document end-to-end with embeddings
   * 
   * Flow:
   * 1. Read file from storage
   * 2. Parse PDF to extract text
   * 3. Chunk the text
   * 4. Embed each chunk (NEW in Phase 2c)
   * 5. Save chunks with embeddings to database
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
      logger.info('Reading PDF file', { documentId });
      const fileBuffer = await storage.readFile(document.file_path);

      // Step 3: Parse PDF
      logger.info('Parsing PDF', { documentId });
      const { text, pages, metadata } = await pdfParser.extractText(fileBuffer);

      // Step 4: Chunk text
      logger.info('Chunking text', { documentId });
      const chunks = await chunking.chunk(text, {
        chunkSize: this._calculateOptimalChunkSize(text.length),
        overlapSize: 100,
        minChunkSize: 50
      });

      logger.info('Text chunked successfully', { 
        documentId, 
        chunkCount: chunks.length 
      });

      // Step 5: Embed chunks and save (NEW in Phase 2c)
      logger.info('Embedding chunks', { documentId, count: chunks.length });

      // Get texts to embed
      const textsToEmbed = chunks.map(c => c.text);

      // Embed in batch for efficiency
      const embeddingResults = await embedding.embedBatch(textsToEmbed, {
        cache,
        useCache: true
      });

      // Log embedding stats
      const cachedCount = embeddingResults.filter(r => r.cached).length;
      logger.info('Chunks embedded', {
        documentId,
        total: chunks.length,
        cached: cachedCount,
        api_calls: chunks.length - cachedCount
      });

      // Step 6: Save chunks with embeddings
      logger.info('Saving chunks to database', { 
        documentId, 
        count: chunks.length 
      });

      const chunksToPersist = chunks.map((chunk, index) => ({
        document_id: documentId,
        chunk_index: chunk.index,
        text: chunk.text,
        position: chunk.position,
        embedding: embeddingResults[index].embedding, // Store embedding!
        metadata: JSON.stringify(chunk.statistics)
      }));

      // Batch insert
      await chunkModel.createMany(chunksToPersist);

      logger.info('Chunks saved with embeddings', { 
        documentId, 
        count: chunksToPersist.length 
      });

      // Step 7: Update document status
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
        avgChunkSize: Math.round(text.length / chunks.length),
        embeddingsCached: cachedCount,
        embeddingsFromAPI: chunks.length - cachedCount
      });

      return {
        success: true,
        documentId,
        chunkCount: chunks.length,
        duration,
        embeddingStats: {
          cached: cachedCount,
          fromAPI: chunks.length - cachedCount
        }
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

### Part 4: Update ChunkModel for Embeddings

**File:** `backend/src/models/chunk.model.js`

```javascript
/**
 * Add to existing ChunkModel
 */

/**
 * Find chunks by similarity to a query vector (RAG retrieval)
 * This will be used in Phase 2d for retrieval
 * 
 * @async
 * @param {array} queryEmbedding - Query embedding vector
 * @param {number} documentId - Document to search in
 * @param {number} topK - Number of results to return (default: 5)
 * @throws {ServiceError} If query fails
 * @returns {array} Most similar chunks with similarity scores
 */
async findSimilarChunks(queryEmbedding, documentId, topK = 5) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT 
        id,
        chunk_index,
        text,
        position,
        1 - (embedding <=> $1::vector) as similarity
      FROM chunks
      WHERE document_id = $2 AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $3`,
      [
        JSON.stringify(queryEmbedding),
        documentId,
        topK
      ]
    );

    return result.rows.map(row => ({
      id: row.id,
      chunkIndex: row.chunk_index,
      text: row.text,
      position: row.position,
      similarity: parseFloat(row.similarity).toFixed(4)
    }));

  } catch (error) {
    logger.error('Similarity search failed', { error: error.message });
    throw new ServiceError(
      'Failed to search similar chunks',
      'SIMILARITY_SEARCH_ERROR'
    );
  } finally {
    client.release();
  }
}

/**
 * Count embedded chunks for a document
 * 
 * @async
 * @param {number} documentId - Document ID
 * @returns {number} Count of chunks with embeddings
 */
async countEmbeddedChunks(documentId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT COUNT(*) as count 
       FROM chunks 
       WHERE document_id = $1 AND embedding IS NOT NULL`,
      [documentId]
    );

    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    logger.error('Count embedded chunks failed', { error: error.message });
    throw new ServiceError('Failed to count embedded chunks', 'COUNT_ERROR');
  } finally {
    client.release();
  }
}

/**
 * Update chunk with embedding
 * 
 * @async
 * @param {number} chunkId - Chunk ID
 * @param {array} embedding - Embedding vector
 * @throws {ServiceError} If update fails
 */
async updateEmbedding(chunkId, embedding) {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE chunks 
       SET embedding = $1, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(embedding), chunkId]
    );
  } catch (error) {
    logger.error('Embedding update failed', { error: error.message });
    throw new ServiceError('Failed to update embedding', 'UPDATE_ERROR');
  } finally {
    client.release();
  }
}
```

---

### Part 5: Update Registry

**File:** `backend/src/registry.js`

```javascript
/**
 * Add to existing registry
 */

// Services
const embedding = require('./services/embedding.service'); // NEW

module.exports = {
  // Services
  pdfParser,
  storage,
  cache,
  chunking,
  embedding,      // NEW

  // ... rest of registry
};
```

---

### Part 6: Environment Configuration

**File:** `.env`

```env
# Existing vars
DATABASE_URL=postgresql://dev:dev123@localhost:5432/rag_chat
REDIS_URL=redis://localhost:6379
GROQ_API_KEY=your_groq_key
HUGGINGFACE_API_KEY=hf_your_key

# Phase 2c: Embedding Service
EMBEDDING_TIMEOUT=30000              # 30 seconds
EMBEDDING_BATCH_SIZE=32              # Texts per batch
EMBEDDING_CACHE_TTL=86400            # 24 hours in seconds
EMBEDDING_MAX_RETRIES=3              # Retry attempts for API calls
```

---

## 🧪 Testing Strategy for Phase 2c

### Unit Tests
```bash
npm test -- embedding.service.test.js

# Should pass:
✅ Embed single text
✅ Embed returns cached result
✅ Invalid text throws error
✅ API rate limiting with retries
✅ Invalid API key error
✅ Timeout handling
✅ Embedding dimension validation
✅ Cache failure (fail-open)
✅ Batch embedding
✅ Cache usage in batches
✅ Large batch splitting
```

### Integration Tests
```bash
# Test full pipeline with embeddings
npm test -- document.pipeline.test.js

# Should pass:
✅ End-to-end: PDF → Text → Chunks → Embeddings
✅ Embeddings saved to database
✅ Chunks queryable by similarity
✅ Cache used for repeated chunks
```

### Manual Testing
```bash
# 1. Upload PDF
curl -F "file=@sample.pdf" http://localhost:5000/api/upload

# 2. Monitor logs for embedding progress
# Should see: "Embedding chunks", "Chunks embedded"

# 3. Verify chunks have embeddings
docker exec -it rag_chat_postgres psql -U dev -d rag_chat
SELECT id, chunk_index, embedding IS NOT NULL as has_embedding 
FROM chunks 
WHERE document_id = 1 
LIMIT 10;

# 4. Test similarity search (for Phase 2d prep)
SELECT 
  id,
  chunk_index,
  (embedding <=> $1::vector) as distance
FROM chunks
WHERE document_id = 1 AND embedding IS NOT NULL
ORDER BY embedding <=> $1::vector
LIMIT 5;
```

---

## 📊 Performance Metrics for Phase 2c

| Metric | Target | Method |
|--------|--------|--------|
| Single embed API | <1s | Benchmark |
| Single embed cached | <5ms | Benchmark |
| Batch embed (32 items) | <3s | Benchmark |
| Cache hit rate | 70%+ | Monitor |
| API retry success | 95%+ | Error logs |
| Embedding dimensions | 384 | Unit test |
| Vector storage size | ~1.5KB per chunk | Calculate |

**For 1000 chunks:**
- First run: ~40 seconds (32 batches × 1s each)
- With 70% cache hit: ~20 seconds
- Subsequent runs: ~5 seconds (mostly cached)

---

## ✅ Phase 2c Completion Checklist

- [ ] EmbeddingService implemented (600+ lines)
- [ ] EmbeddingService tests written (25+ test cases)
- [ ] All tests passing ✅
- [ ] DocumentPipeline updated to embed chunks
- [ ] ChunkModel updated with similarity search
- [ ] Registry updated with embedding service
- [ ] Environment variables configured
- [ ] Manual end-to-end test successful
- [ ] Embeddings stored in database with pgvector
- [ ] Cache working properly for embeddings
- [ ] Error handling (API failures, timeouts, retries) tested
- [ ] Documentation updated

---

## 🎯 Key Differences from Phase 2a/2b

| Aspect | Phase 2a | Phase 2b | Phase 2c |
|--------|----------|----------|----------|
| Input | File path | Text string | Text string |
| Output | Text | Array of chunks | Vector (384 dims) |
| I/O | File system | None | API calls |
| Caching | CacheService | None | CacheService (critical!) |
| Complexity | Medium | Low | High |
| Dependencies | Storage | None | Cache, API |
| External Service | None | None | HuggingFace API |
| Batch Support | No | Yes (algorithm) | Yes (API) |

---

## 🔗 Architecture in Context

```
Phase 2a: PDF → Text
         ↓
Phase 2b: Text → Chunks
         ↓
Phase 2c: Chunks → Vectors ← Cache + HF API
         ↓
Phase 2d: Vector Query ← Chunks with vectors
         ↓
Phase 2e: Context → LLM ← Groq API
```

---

## 💡 Why Phase 2c is Critical

Before Phase 2c: Chunks are just text (static)
After Phase 2c: Chunks are queryable by meaning (semantic search)

This enables RAG to work! Without embeddings, there's no way to match user questions to relevant context.

---

## 🚀 What's Next (Phase 2d)

After Phase 2c is complete:

**Phase 2d: RAG Service**
- Takes user query
- Embeds the query (uses same EmbeddingService + cache)
- Searches for similar chunks using pgvector
- Returns relevant context
- Sets up for LLM

**Same pattern:** Create service, wire into pipeline, test.

---

This is your complete Phase 2c implementation guide!

Ready to embed? 🚀

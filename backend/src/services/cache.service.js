/**
 * Cache Service
 *
 * Thin wrapper around Redis for service-layer caching.
 * Reusable by any service (PDFParser, Chunking, Embedding, etc.)
 *
 * Features:
 *  - Namespaced keys (each service gets its own prefix)
 *  - Automatic JSON serialization/deserialization
 *  - TTL support with configurable defaults
 *  - Graceful degradation (cache miss on Redis failure, never crashes)
 */

const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');
const { createHash } = require('crypto');
const fs = require('fs').promises;

const DEFAULT_TTL = 3600; // 1 hour in seconds

class CacheService {
  /**
   * Generate a cache key from a file's content hash.
   * Uses first 1MB + file size + modification time for uniqueness.
   * Reusable by any service that caches file-derived data.
   *
   * @param {string} filePath - Absolute path to the file
   * @returns {Promise<string|null>} SHA-256 hash or null on error
   */
  async generateFileKey(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const fileBuffer = await fs.readFile(filePath, { flag: 'r' });
      return createHash('sha256')
        .update(fileBuffer.slice(0, 1024 * 1024)) // First 1MB
        .update(String(stats.size))
        .update(String(stats.mtimeMs))
        .digest('hex');
    } catch (error) {
      logger.error('Cache key generation failed', {
        filePath,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Get a value from cache
   *
   * @param {string} namespace - Service prefix (e.g. 'pdf', 'embedding')
   * @param {string} key - Cache key
   * @returns {Promise<*|null>} Parsed value or null on miss/error
   */
  async get(namespace, key) {
    try {
      const redis = getRedisClient();
      const fullKey = `cache:${namespace}:${key}`;
      const raw = await redis.get(fullKey);

      if (raw === null) {
        return null;
      }

      logger.debug('Cache hit', { namespace, key: key.substring(0, 12) });
      return JSON.parse(raw);
    } catch (error) {
      // Graceful degradation — log and return null (treat as cache miss)
      logger.warn('Cache get failed, treating as miss', {
        namespace,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Store a value in cache
   *
   * @param {string} namespace - Service prefix
   * @param {string} key - Cache key
   * @param {*} value - Value to store (will be JSON-serialized)
   * @param {number} [ttl] - Time-to-live in seconds (default: 3600)
   */
  async set(namespace, key, value, ttl = DEFAULT_TTL) {
    try {
      const redis = getRedisClient();
      const fullKey = `cache:${namespace}:${key}`;
      const serialized = JSON.stringify(value);

      await redis.set(fullKey, serialized, { EX: ttl });

      logger.debug('Cache set', { namespace, key: key.substring(0, 12), ttl });
    } catch (error) {
      // Graceful degradation — log and continue
      logger.warn('Cache set failed, continuing without cache', {
        namespace,
        error: error.message,
      });
    }
  }

  /**
   * Delete a specific cache entry
   *
   * @param {string} namespace - Service prefix
   * @param {string} key - Cache key
   */
  async del(namespace, key) {
    try {
      const redis = getRedisClient();
      const fullKey = `cache:${namespace}:${key}`;
      await redis.del(fullKey);
    } catch (error) {
      logger.warn('Cache delete failed', { namespace, error: error.message });
    }
  }

  /**
   * Clear all cache entries for a namespace
   *
   * @param {string} namespace - Service prefix to clear
   * @returns {Promise<number>} Number of keys deleted
   */
  async clearNamespace(namespace) {
    try {
      const redis = getRedisClient();
      const pattern = `cache:${namespace}:*`;
      const keys = await redis.keys(pattern);

      if (keys.length === 0) return 0;

      await redis.del(keys);
      logger.info('Cache namespace cleared', { namespace, count: keys.length });
      return keys.length;
    } catch (error) {
      logger.warn('Cache clear failed', { namespace, error: error.message });
      return 0;
    }
  }

  /**
   * Get stats for a namespace
   *
   * @param {string} namespace - Service prefix
   * @returns {Promise<object>} Cache statistics
   */
  async getStats(namespace) {
    try {
      const redis = getRedisClient();
      const pattern = `cache:${namespace}:*`;
      const keys = await redis.keys(pattern);

      return {
        namespace,
        entryCount: keys.length,
        keys: keys.map((k) => k.replace(`cache:${namespace}:`, '').substring(0, 12) + '...'),
      };
    } catch (error) {
      logger.warn('Cache stats failed', { namespace, error: error.message });
      return { namespace, entryCount: 0, keys: [] };
    }
  }
}

module.exports = new CacheService();

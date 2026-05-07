const { createClient } = require('redis');
const config = require('./index');

let redisClient = null;

/**
 * Create and connect Redis client
 */
const connectRedis = async () => {
  redisClient = createClient({
    url: config.redisUrl,
  });

  redisClient.on('error', (err) => {
    console.error('❌ Redis error:', err.message);
  });

  redisClient.on('connect', () => {
    console.log('✅ Redis connected');
  });

  await redisClient.connect();
  return redisClient;
};

/**
 * Get the Redis client instance
 */
const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redisClient;
};

module.exports = { connectRedis, getRedisClient };

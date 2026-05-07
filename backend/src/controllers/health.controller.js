const { pool } = require('../config/database');
const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * GET /api/health
 * Returns system health status including DB and Redis connectivity
 */
const getHealth = async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: 'unknown',
      redis: 'unknown',
    },
  };

  // Check PostgreSQL
  try {
    await pool.query('SELECT 1');
    health.services.database = 'connected';
  } catch {
    health.services.database = 'disconnected';
    health.status = 'degraded';
  }

  // Check Redis
  try {
    const redis = getRedisClient();
    await redis.ping();
    health.services.redis = 'connected';
  } catch {
    health.services.redis = 'disconnected';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
};

module.exports = { getHealth };

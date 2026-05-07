const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { testConnection } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { runMigrations } = require('./db/init');
const { initQueue } = require('./jobs/queue');
const { registerProcessor } = require('./jobs/process-document.job');

/**
 * Initialize all services and start the Express server
 */
const startServer = async () => {
  try {
    // 1. Connect to PostgreSQL
    logger.info('🔄 Connecting to PostgreSQL...');
    await testConnection();

    // 2. Run database migrations (idempotent)
    logger.info('🔄 Running database migrations...');
    await runMigrations();

    // 3. Connect to Redis
    logger.info('🔄 Connecting to Redis...');
    await connectRedis();

    // 4. Initialize job queue
    logger.info('🔄 Initializing job queue...');
    const queue = initQueue();
    registerProcessor(queue);

    // 5. Start Express server
    app.listen(config.port, () => {
      logger.info(`
  ╔══════════════════════════════════════════════╗
  ║   🚀 RAG Chat Backend is running!           ║
  ║                                              ║
  ║   Port:        ${config.port}                        ║
  ║   Environment: ${config.nodeEnv.padEnd(15)}          ║
  ║   Health:      http://localhost:${config.port}/api/health  ║
  ╚══════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`\n${signal} received. Shutting down gracefully...`);
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled rejections
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

// Start!
startServer();

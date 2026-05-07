/**
 * Bull Job Queue Setup
 *
 * Configures the document processing queue backed by Redis.
 */

const Queue = require('bull');
const config = require('../config');
const logger = require('../utils/logger');

let documentQueue = null;

/**
 * Initialize the document processing queue
 */
const initQueue = () => {
  documentQueue = new Queue('document-processing', config.redisUrl, {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 50, // Keep last 50 completed jobs
      removeOnFail: 100,    // Keep last 100 failed jobs
    },
  });

  // Queue event listeners
  documentQueue.on('completed', (job) => {
    logger.info(`✅ Job ${job.id} completed: document ${job.data.documentId}`);
  });

  documentQueue.on('failed', (job, err) => {
    logger.error(`❌ Job ${job.id} failed: ${err.message}`);
  });

  documentQueue.on('stalled', (job) => {
    logger.warn(`⚠️ Job ${job.id} stalled`);
  });

  logger.info('📋 Document processing queue initialized');
  return documentQueue;
};

/**
 * Get the queue instance
 */
const getQueue = () => {
  if (!documentQueue) {
    throw new Error('Queue not initialized. Call initQueue() first.');
  }
  return documentQueue;
};

module.exports = { initQueue, getQueue };

/**
 * Document Processing Job
 *
 * Background worker that processes uploaded PDFs:
 * 1. Extract text from PDF
 * 2. Split into overlapping chunks
 * 3. Generate embeddings for each chunk
 * 4. Store chunks + embeddings in PostgreSQL (pgvector)
 * 5. Update document status
 */

const logger = require('../utils/logger');
const { documentPipeline, documentRepository } = require('../registry');

/**
 * Register the document processing job handler
 * @param {Queue} queue - Bull queue instance
 */
const registerProcessor = (queue) => {
  queue.process('process-document', async (job) => {
    const { documentId, filePath, mimeType } = job.data;
    logger.info(`🔄 Processing document ${documentId}: ${filePath}`);

    try {
      // Delegate the entire end-to-end processing to the pipeline
      await documentPipeline.process(documentId, filePath, (progress) => {
        job.progress(progress);
      });

      logger.info(`✅ Document ${documentId} processed successfully`);
      return { documentId, status: 'completed' };
    } catch (error) {
      logger.error(`❌ Document ${documentId} processing failed: ${error.message}`);
      // await documentRepository.updateStatus(documentId, 'failed', error.message);
      throw error; // Bull will retry based on job options
    }
  });

  logger.info('🔧 Document processing job handler registered');
};

module.exports = { registerProcessor };

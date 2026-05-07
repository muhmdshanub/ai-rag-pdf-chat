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

// TODO: Import services when implementing
// const pdfParser = require('../services/pdf-parser.service');
// const chunking = require('../services/chunking.service');
// const embedding = require('../services/embedding.service');
// const documentModel = require('../models/document.model');
// const chunkModel = require('../models/chunk.model');

/**
 * Register the document processing job handler
 * @param {Queue} queue - Bull queue instance
 */
const registerProcessor = (queue) => {
  queue.process('process-document', async (job) => {
    const { documentId, filePath, mimeType } = job.data;
    logger.info(`🔄 Processing document ${documentId}: ${filePath}`);

    try {
      // Step 1: Extract text
      // const { text, pages } = await pdfParser.extractFromFile(filePath, mimeType);
      // job.progress(20);

      // Step 2: Chunk text
      // const chunks = chunking.chunkWithMetadata(text);
      // job.progress(40);

      // Step 3: Generate embeddings
      // const embeddings = await embedding.getEmbeddings(chunks.map(c => c.text));
      // job.progress(60);

      // Step 4: Store in database
      // const chunksWithEmbeddings = chunks.map((chunk, i) => ({
      //   ...chunk,
      //   embedding: embeddings[i],
      // }));
      // await chunkModel.createBatch(documentId, chunksWithEmbeddings);
      // job.progress(80);

      // Step 5: Update document status
      // await documentModel.updateStatus(documentId, 'completed');
      // await documentModel.updateChunkCount(documentId, chunks.length);
      // job.progress(100);

      logger.info(`✅ Document ${documentId} processed successfully`);
      return { documentId, status: 'completed' };
    } catch (error) {
      logger.error(`❌ Document ${documentId} processing failed: ${error.message}`);
      // await documentModel.updateStatus(documentId, 'failed', error.message);
      throw error; // Bull will retry based on job options
    }
  });

  logger.info('🔧 Document processing job handler registered');
};

module.exports = { registerProcessor };

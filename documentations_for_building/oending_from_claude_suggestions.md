🚀 Phase 2f, 2g & Beyond - Complete Roadmap
Current Status
✅ What's Complete (Phase 2a - 2e)
Phase 2a: PDF Parser Service ✅ Complete
Phase 2b: Chunking Service 📋 Plan Ready
Phase 2c: Embedding Service 📋 Plan Ready
Phase 2d: RAG Retrieval Service 📋 Plan Ready
Phase 2e: LLM Service 📋 Plan Ready
📋 What's Next
Phase 2f: Controller Integration 🔄 Next
Phase 2g: Async Job Processing 🔄 Then
Phase 3: Frontend Build ⏳ After
Phase 4: Deployment & Scaling ⏳ Production

🎯 Phase 2f: Controller Integration & API Orchestration
Overview
Goal: Wire everything together - Controllers orchestrating the complete flow
What Phase 2f Does:

Implement thin controllers for all endpoints
Add input validation at HTTP boundary
Proper error response formatting
Request/response logging
Status code handling

What Already Exists
✅ UploadController (mostly done, refine as needed)
✅ ChatController (Phase 2e version)
✅ DocumentController (basic CRUD)
✅ All validation schemas (Joi)
✅ All pipelines (orchestration layer)
What Needs to Happen in Phase 2f

1. Refine UploadController
   File: backend/src/controllers/upload.controller.js (Complete)
   javascript/\*\*

- Upload Controller - Complete Implementation
  \*/

const { documentModel, uploadQueue, storage, logger } = require('../registry');
const ServiceError = require('../utils/error.service');

/\*\*

- POST /api/upload
-
- Endpoint for uploading PDF documents
-
- Flow:
- 1.  Validate file (done by middleware)
- 2.  Create document record (status: 'processing')
- 3.  Queue async job
- 4.  Return immediately (status 202 Accepted)
-
- The document processes in background via Bull queue
  \*/
  exports.uploadDocument = async (req, res, next) => {
  const startTime = Date.now();

try {
// File is validated by middleware
if (!req.file) {
return res.status(400).json({
success: false,
error: 'No file provided',
code: 'NO_FILE'
});
}

    const { filename, path: filePath, size, mimetype } = req.file;
    const userId = req.user?.id || 'anonymous'; // Add user tracking later

    logger.info('File upload received', {
      filename,
      size,
      mimetype,
      userId
    });

    // Create document record
    const document = await documentModel.create({
      filename,
      file_path: filePath,
      file_size: size,
      mime_type: mimetype,
      status: 'processing',
      user_id: userId
    });

    logger.info('Document record created', {
      documentId: document.id,
      filename
    });

    // Queue async processing job
    const job = await uploadQueue.add(
      'process-document',
      {
        documentId: document.id,
        filePath: filePath,
        filename: filename
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: true,
        removeOnFail: false
      }
    );

    logger.info('Processing job queued', {
      jobId: job.id,
      documentId: document.id
    });

    const duration = Date.now() - startTime;

    // Return 202 Accepted (processing in background)
    return res.status(202).json({
      success: true,
      message: 'Document uploaded and queued for processing',
      document: {
        id: document.id,
        filename: document.filename,
        status: document.status,
        size: document.file_size,
        createdAt: document.created_at,
        estimatedProcessingTime: '30-60 seconds'
      },
      job: {
        id: job.id
      },
      duration
    });

} catch (error) {
logger.error('Upload error', {
error: error.message,
stack: error.stack
});

    // Clean up uploaded file on error
    if (req.file?.path) {
      try {
        await storage.deleteFile(req.file.path);
      } catch (cleanupError) {
        logger.error('File cleanup failed', { error: cleanupError.message });
      }
    }

    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to upload document',
      code: error.code || 'UPLOAD_ERROR'
    });

}
};

/\*\*

- GET /api/upload/:documentId/progress
-
- Check processing progress of a document
  \*/
  exports.getUploadProgress = async (req, res, next) => {
  try {
  const { documentId } = req.params;

      // Validate ID
      if (!documentId || isNaN(documentId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid document ID',
          code: 'INVALID_ID'
        });
      }

      // Get document
      const document = await documentModel.findById(documentId);

      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'Document not found',
          code: 'NOT_FOUND'
        });
      }

      // Check job status if processing
      let jobStatus = null;
      if (document.status === 'processing') {
        // Get job from queue (implementation depends on your job tracking)
        logger.info('Document processing', { documentId });
      }

      return res.json({
        success: true,
        document: {
          id: document.id,
          filename: document.filename,
          status: document.status,
          totalChunks: document.total_chunks,
          progress: this._calculateProgress(document),
          createdAt: document.created_at,
          processedAt: document.processed_at,
          error: document.error_message
        },
        job: jobStatus
      });

} catch (error) {
logger.error('Progress check error', { error: error.message });
return res.status(500).json({
success: false,
error: 'Failed to check progress',
code: 'PROGRESS_ERROR'
});
}
};

/\*\*

- Calculate progress percentage
- @private
  \*/
  exports.\_calculateProgress = (document) => {
  switch (document.status) {
  case 'completed':
  return 100;
  case 'processing':
  return 50; // Rough estimate
  case 'failed':
  return 0;
  default:
  return 0;
  }
  };

2. Complete DocumentController
   File: backend/src/controllers/document.controller.js
   javascript/\*\*

- Document Controller
-
- Handles document CRUD operations
  \*/

const { documentModel, chunkModel, logger } = require('../registry');
const ServiceError = require('../utils/error.service');

/\*\*

- GET /api/documents
-
- List all documents
  _/
  exports.listDocuments = async (req, res) => {
  try {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) _ limit;

      const documents = await documentModel.paginate(limit, offset);
      const total = await documentModel.count();

      return res.json({
        success: true,
        documents,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

} catch (error) {
logger.error('List documents error', { error: error.message });
return res.status(500).json({
success: false,
error: 'Failed to list documents',
code: 'LIST_ERROR'
});
}
};

/\*\*

- GET /api/documents/:documentId
-
- Get document details
  \*/
  exports.getDocument = async (req, res) => {
  try {
  const { documentId } = req.params;

      const document = await documentModel.findById(documentId);

      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'Document not found',
          code: 'NOT_FOUND'
        });
      }

      // Get chunk count and stats
      const chunkCount = await chunkModel.countByDocumentId(documentId);
      const embeddedCount = await chunkModel.countEmbeddedChunks(documentId);

      return res.json({
        success: true,
        document: {
          ...document,
          chunks: {
            total: chunkCount,
            embedded: embeddedCount,
            coverage: chunkCount > 0 ? ((embeddedCount / chunkCount) * 100).toFixed(2) + '%' : '0%'
          },
          readyForChat: embeddedCount > 0
        }
      });

} catch (error) {
logger.error('Get document error', { error: error.message });
return res.status(500).json({
success: false,
error: 'Failed to get document',
code: 'GET_ERROR'
});
}
};

/\*\*

- DELETE /api/documents/:documentId
-
- Delete document and all associated data
  \*/
  exports.deleteDocument = async (req, res) => {
  try {
  const { documentId } = req.params;

      const document = await documentModel.findById(documentId);

      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'Document not found',
          code: 'NOT_FOUND'
        });
      }

      // Delete chunks
      await chunkModel.deleteByDocumentId(documentId);

      // Delete document
      await documentModel.delete(documentId);

      logger.info('Document deleted', { documentId });

      return res.json({
        success: true,
        message: 'Document deleted successfully'
      });

} catch (error) {
logger.error('Delete document error', { error: error.message });
return res.status(500).json({
success: false,
error: 'Failed to delete document',
code: 'DELETE_ERROR'
});
}
};

/\*\*

- GET /api/documents/:documentId/retrieval-stats
-
- Get RAG retrieval readiness stats
  \*/
  exports.getRetrievalStats = async (req, res) => {
  try {
  const { documentId } = req.params;

      const document = await documentModel.findById(documentId);

      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'Document not found',
          code: 'NOT_FOUND'
        });
      }

      // Import rag service
      const { rag } = require('../registry');
      const stats = await rag.getRetrievalStats(documentId, chunkModel);

      return res.json({
        success: true,
        stats
      });

} catch (error) {
logger.error('Retrieval stats error', { error: error.message });
return res.status(500).json({
success: false,
error: 'Failed to get stats',
code: 'STATS_ERROR'
});
}
}; 3. Complete ChatController
File: backend/src/controllers/chat.controller.js (Already in Phase 2e, just ensure complete)
javascript/\*\*

- Chat Controller - Complete
-
- Handles conversation with documents
  \*/

const { chatPipeline, documentModel, logger } = require('../registry');
const ServiceError = require('../utils/error.service');

/\*\*

- POST /api/chat
-
- Chat with a document (complete RAG + LLM flow)
  \*/
  exports.chat = async (req, res) => {
  const startTime = Date.now();

try {
const { documentId, message, model } = req.body;

    // Verify document exists
    const document = await documentModel.findById(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
        code: 'NOT_FOUND'
      });
    }

    logger.info('Chat request', {
      documentId,
      messageLength: message.length,
      model
    });

    // Call pipeline (RAG + LLM)
    const result = await chatPipeline.chat({
      documentId,
      message,
      model
    });

    const duration = Date.now() - startTime;

    return res.json({
      success: true,
      message: result.message,
      metadata: {
        ...result.metadata,
        totalDuration: duration
      }
    });

} catch (error) {
logger.error('Chat error', { error: error.message });

    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message,
      code: error.code || 'CHAT_ERROR'
    });

}
};

/\*\*

- POST /api/chat/stream
-
- Stream chat response in real-time
  \*/
  exports.chatStream = async (req, res) => {
  try {
  const { documentId, message, model } = req.body;

      logger.info('Streaming chat request', { documentId });

      // Set headers for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Stream tokens
      const startTime = Date.now();

      for await (const token of chatPipeline.chatStream({
        documentId,
        message,
        model
      })) {
        res.write(`data: ${JSON.stringify({
          token,
          timestamp: Date.now()
        })}\n\n`);
      }

      // Stream complete
      res.write(`data: ${JSON.stringify({
        done: true,
        duration: Date.now() - startTime
      })}\n\n`);

      res.end();

} catch (error) {
logger.error('Streaming error', { error: error.message });

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: error.message,
        code: error.code || 'STREAM_ERROR'
      });
    }

    res.write(`data: ${JSON.stringify({
      error: error.message,
      code: error.code
    })}\n\n`);
    res.end();

}
};

/\*\*

- GET /api/chat/history/:documentId
-
- Get conversation history for a document
  \*/
  exports.getChatHistory = async (req, res) => {
  try {
  const { documentId } = req.params;
  const { page = 1, limit = 10 } = req.query;

      const offset = (page - 1) * limit;

      const messages = await chatMessageModel.findByDocumentId(
        documentId,
        limit,
        offset
      );

      const total = await chatMessageModel.countByDocumentId(documentId);

      return res.json({
        success: true,
        messages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

} catch (error) {
logger.error('Chat history error', { error: error.message });
return res.status(500).json({
success: false,
error: 'Failed to get chat history',
code: 'HISTORY_ERROR'
});
}
}; 4. Complete Routes
File: backend/src/routes/index.js
javascript/\*\*

- Route Aggregator
  \*/

const express = require('express');
const router = express.Router();

const uploadRoutes = require('./upload.routes');
const chatRoutes = require('./chat.routes');
const documentRoutes = require('./document.routes');
const healthRoutes = require('./health.routes');

// Health check (always available)
router.use('/health', healthRoutes);

// Document management
router.use('/documents', documentRoutes);

// Upload documents
router.use('/upload', uploadRoutes);

// Chat with documents
router.use('/chat', chatRoutes);

// 404 handler
router.use((req, res) => {
res.status(404).json({
success: false,
error: 'Endpoint not found',
code: 'NOT_FOUND',
path: req.path
});
});

module.exports = router;
Phase 2f Checklist

UploadController complete with queue integration
DocumentController with CRUD + stats
ChatController with streaming support
All routes implemented
Error handling consistent across all controllers
Proper HTTP status codes used
All tests passing
Documentation updated

🎯 Phase 2g: Async Job Processing & Background Tasks
Overview
Goal: Implement background processing for PDF documents using Bull Queue
What Phase 2g Does:

Implement process-document job
Orchestrate PDF → Chunks → Embeddings
Error handling & retries
Job monitoring
Progress tracking

Implementation
File: backend/src/jobs/process-document.job.js
javascript/\*\*

- Process Document Job
-
- Handles async PDF processing:
- 1.  Extract text
- 2.  Chunk text
- 3.  Embed chunks
- 4.  Save to database
      \*/

const {
storage,
pdfParser,
chunking,
embedding,
chunkModel,
documentModel,
cache,
logger
} = require('../registry');

/\*\*

- Define job processor
- Called by Bull queue when job is ready
  \*/
  module.exports = async (job) => {
  const { documentId, filePath } = job.data;
  const startTime = Date.now();

try {
logger.info('Document processing started', { documentId, jobId: job.id });

    // Step 1: Read file
    logger.info('Reading file', { documentId });
    job.progress(10);

    const fileBuffer = await storage.readFile(filePath);

    // Step 2: Extract text
    logger.info('Extracting text', { documentId });
    job.progress(20);

    const { text, pages, metadata } = await pdfParser.extractText(fileBuffer);

    logger.info('Text extracted', {
      documentId,
      pages,
      textLength: text.length
    });

    // Step 3: Chunk text
    logger.info('Chunking text', { documentId });
    job.progress(30);

    const chunks = await chunking.chunk(text, {
      chunkSize: 500,
      overlapSize: 100,
      minChunkSize: 50
    });

    logger.info('Text chunked', { documentId, chunks: chunks.length });
    job.progress(50);

    // Step 4: Embed chunks (batch processing)
    logger.info('Embedding chunks', { documentId, count: chunks.length });
    job.progress(60);

    const textsToEmbed = chunks.map(c => c.text);
    const embeddingResults = await embedding.embedBatch(textsToEmbed, {
      cache,
      useCache: true
    });

    logger.info('Chunks embedded', { documentId });
    job.progress(75);

    // Step 5: Save chunks to database
    logger.info('Saving chunks to database', { documentId });
    job.progress(80);

    const chunksToPersist = chunks.map((chunk, index) => ({
      document_id: documentId,
      chunk_index: chunk.index,
      text: chunk.text,
      position: chunk.position,
      embedding: embeddingResults[index].embedding,
      metadata: JSON.stringify(chunk.statistics)
    }));

    const savedChunks = await chunkModel.createMany(chunksToPersist);

    logger.info('Chunks saved', { documentId, saved: savedChunks.length });
    job.progress(90);

    // Step 6: Update document status
    logger.info('Updating document', { documentId });
    job.progress(95);

    await documentModel.update(documentId, {
      status: 'completed',
      total_chunks: chunks.length,
      processed_at: new Date(),
      pages: pages,
      metadata: JSON.stringify(metadata)
    });

    job.progress(100);

    const duration = Date.now() - startTime;

    logger.info('Document processing completed', {
      documentId,
      jobId: job.id,
      duration,
      chunks: chunks.length,
      tokens: embeddingResults.length
    });

    return {
      success: true,
      documentId,
      chunks: chunks.length,
      duration,
      embeddingsCached: embeddingResults.filter(r => r.cached).length
    };

} catch (error) {
logger.error('Document processing failed', {
documentId,
jobId: job.id,
error: error.message,
stack: error.stack
});

    // Update document as failed
    try {
      await documentModel.update(documentId, {
        status: 'failed',
        error_message: error.message
      });
    } catch (updateError) {
      logger.error('Failed to update document status', {
        error: updateError.message
      });
    }

    // Throw to let Bull know job failed
    throw error;

}
};

/\*\*

- Error handler for failed jobs
- Called when job max retries exceeded
  \*/
  module.exports.onFailed = async (job, error) => {
  const { documentId } = job.data;

logger.error('Job permanently failed', {
documentId,
jobId: job.id,
attempts: job.attemptsMade,
error: error.message
});

// Update document as failed
try {
await documentModel.update(documentId, {
status: 'failed',
error_message: `Processing failed after ${job.attemptsMade} attempts: ${error.message}`
});
} catch (e) {
logger.error('Failed to update failed status', { error: e.message });
}
};

/\*\*

- Retry handler
- Called when job is retried
  \*/
  module.exports.onRetry = async (job, error) => {
  logger.warn('Job retrying', {
  jobId: job.id,
  documentId: job.data.documentId,
  attempt: job.attemptsMade,
  error: error.message
  });
  };
  File: backend/src/jobs/queue.js (Setup Bull Queue)
  javascript/\*\*
- Bull Queue Setup
-
- Configures queues for async processing
  \*/

const Queue = require('bull');
const redis = require('redis');
const logger = require('../utils/logger');

// Create queues
const uploadQueue = new Queue('document-processing', {
redis: {
host: process.env.REDIS_HOST || 'localhost',
port: process.env.REDIS_PORT || 6379
}
});

// Process document jobs
const processDocumentJob = require('./process-document.job');

uploadQueue.process('process-document', processDocumentJob);

// Event handlers
uploadQueue.on('completed', (job) => {
logger.info('Job completed', { jobId: job.id });
});

uploadQueue.on('failed', (job, error) => {
logger.error('Job failed', { jobId: job.id, error: error.message });
});

uploadQueue.on('stalled', (job) => {
logger.warn('Job stalled', { jobId: job.id });
});

uploadQueue.on('progress', (job, progress) => {
logger.debug('Job progress', { jobId: job.id, progress });
});

module.exports = {
uploadQueue
};
Phase 2g Checklist

process-document.job.js implemented
Queue setup with event handlers
Error handling & retries
Progress tracking
Job monitoring
Tests for job processing
Documentation updated

📊 After Phase 2g: Complete Backend!
At this point you have a fully functional RAG system:
✅ Phase 1: Infrastructure (Docker, DB, Redis)
✅ Phase 2a: PDF Parser (extract text)
✅ Phase 2b: Chunking (split text)
✅ Phase 2c: Embeddings (vectors)
✅ Phase 2d: RAG Retrieval (find chunks)
✅ Phase 2e: LLM (generate answers)
✅ Phase 2f: Controllers (HTTP API)
✅ Phase 2g: Async Jobs (background processing)

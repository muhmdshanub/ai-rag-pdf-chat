/**
 * Application Constants
 */

const AI_ROLES = {
  SYSTEM: 'system',
  USER: 'user',
  ASSISTANT: 'assistant'
};

const DOCUMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

const CACHE_NAMESPACES = {
  PDF_EXTRACTION: 'pdf',
  EMBEDDINGS: 'embedding'
};

module.exports = {
  AI_ROLES,
  DOCUMENT_STATUS,
  CACHE_NAMESPACES
};

const logger = require('../utils/logger');
const { NotFoundError } = require('../utils/errors');

// TODO: Wire up document model when implementing CRUD operations

/**
 * GET /api/documents
 * Returns list of all uploaded documents
 */
const listDocuments = async (req, res) => {
  // TODO: Query documents table
  res.json({
    success: true,
    documents: [],
  });
};

/**
 * GET /api/documents/:id
 * Returns details of a specific document
 */
const getDocument = async (req, res) => {
  const { id } = req.params;

  // TODO: Query document by ID, throw NotFoundError if missing
  res.json({
    success: true,
    document: null,
  });
};

/**
 * DELETE /api/documents/:id
 * Deletes a document and all associated chunks/messages
 */
const deleteDocument = async (req, res) => {
  const { id } = req.params;

  // TODO: Delete document (CASCADE will remove chunks and messages)
  // TODO: Delete file from local storage

  logger.info(`🗑️ Document ${id} deleted`);

  res.json({
    success: true,
    message: 'Document deleted successfully',
  });
};

module.exports = { listDocuments, getDocument, deleteDocument };

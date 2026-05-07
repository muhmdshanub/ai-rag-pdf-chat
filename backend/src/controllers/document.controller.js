const logger = require('../utils/logger');
const { documentModel, storage } = require('../registry');
const { NotFoundError } = require('../utils/errors');

/**
 * GET /api/documents
 * Returns list of all uploaded documents
 */
const listDocuments = async (req, res) => {
  const documents = await documentModel.findAll();
  res.json({
    success: true,
    documents,
  });
};

/**
 * GET /api/documents/:id
 * Returns details of a specific document
 */
const getDocument = async (req, res) => {
  const { id } = req.params;

  const document = await documentModel.findById(id);
  if (!document) {
    throw new NotFoundError(`Document ${id} not found`);
  }

  res.json({
    success: true,
    document,
  });
};

/**
 * DELETE /api/documents/:id
 * Deletes a document and all associated chunks/messages
 */
const deleteDocument = async (req, res) => {
  const { id } = req.params;

  const document = await documentModel.findById(id);
  if (!document) {
    throw new NotFoundError(`Document ${id} not found`);
  }

  // Delete file from local storage
  await storage.deleteFile(document.filename);

  // Delete database record (CASCADE removes chunks and messages)
  await documentModel.delete(id);

  logger.info(`🗑️ Document ${id} deleted`);

  res.json({
    success: true,
    message: 'Document deleted successfully',
  });
};

module.exports = { listDocuments, getDocument, deleteDocument };

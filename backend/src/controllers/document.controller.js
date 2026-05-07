const { documentPipeline } = require('../registry');
const ApiResponse = require('../utils/response');

/**
 * GET /api/documents
 * Returns list of all uploaded documents
 */
const listDocuments = async (req, res) => {
  const documents = await documentPipeline.list();
  return ApiResponse.success(res, { documents });
};

/**
 * GET /api/documents/:id
 * Returns details of a specific document
 */
const getDocument = async (req, res) => {
  const { id } = req.params;
  const document = await documentPipeline.get(id);
  return ApiResponse.success(res, { document });
};

/**
 * DELETE /api/documents/:id
 * Deletes a document and all associated chunks/messages
 */
const deleteDocument = async (req, res) => {
  const { id } = req.params;
  await documentPipeline.delete(id);
  return ApiResponse.success(res, null, 'Document deleted successfully');
};

module.exports = { listDocuments, getDocument, deleteDocument };

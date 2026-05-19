const { documentPipeline, chatMessageRepository } = require('../registry');
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

/**
 * GET /api/documents/:id/chat
 * Returns past chat history messages for a specific document
 */
const getChatHistory = async (req, res) => {
  const { id } = req.params;
  
  // Ensure the document exists first (will throw NotFoundError if not found)
  const document = await documentPipeline.get(id);
  
  const history = await chatMessageRepository.findByDocumentId(document.id);
  return ApiResponse.success(res, { history });
};

module.exports = { listDocuments, getDocument, deleteDocument, getChatHistory };

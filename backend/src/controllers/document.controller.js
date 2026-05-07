const { documentPipeline } = require('../registry');

/**
 * GET /api/documents
 * Returns list of all uploaded documents
 */
const listDocuments = async (req, res) => {
  const documents = await documentPipeline.list();
  
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
  const document = await documentPipeline.get(id);

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
  await documentPipeline.delete(id);

  res.json({
    success: true,
    message: 'Document deleted successfully',
  });
};

module.exports = { listDocuments, getDocument, deleteDocument };

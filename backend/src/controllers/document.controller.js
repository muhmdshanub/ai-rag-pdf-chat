const { documentPipeline, chatMessageRepository, chunkRepository } = require('../registry');
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
  
  const rows = await chatMessageRepository.findByDocumentId(document.id);
  
  const history = [];
  
  for (const row of rows) {
    history.push({
      id: `user-${row.id}`,
      role: 'user',
      content: row.user_message,
      createdAt: row.created_at,
      citations: []
    });
    
    let citations = [];
    if (row.retrieved_chunk_ids && row.retrieved_chunk_ids.length > 0) {
      const chunks = await chunkRepository.findByIds(row.retrieved_chunk_ids);
      // Map them in the exact order they were retrieved to match [1], [2] annotations
      citations = row.retrieved_chunk_ids.map((chunkId, index) => {
        const chunk = chunks.find(c => c.id === chunkId);
        return {
          chunkIndex: index + 1, // Maps to [1], [2] in UI
          dbChunkIndex: chunk ? chunk.chunk_index : null,
          content: chunk ? chunk.content : 'Source text unavailable'
        };
      });
    }

    history.push({
      id: `ai-${row.id}`,
      role: 'assistant',
      content: row.ai_response,
      createdAt: row.created_at,
      citations: citations
    });
  }

  return ApiResponse.success(res, { history });
};

module.exports = { listDocuments, getDocument, deleteDocument, getChatHistory };

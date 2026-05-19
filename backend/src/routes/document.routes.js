const express = require('express');
const {
  listDocuments,
  getDocument,
  deleteDocument,
  getChatHistory,
} = require('../controllers/document.controller');

const router = express.Router();

// GET /api/documents — list all documents
router.get('/', listDocuments);

// GET /api/documents/:id — get document details
router.get('/:id', getDocument);

// DELETE /api/documents/:id — delete a document
router.delete('/:id', deleteDocument);

// GET /api/documents/:id/chat — get document chat history
router.get('/:id/chat', getChatHistory);

module.exports = router;

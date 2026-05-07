const express = require('express');
const {
  listDocuments,
  getDocument,
  deleteDocument,
} = require('../controllers/document.controller');

const router = express.Router();

// GET /api/documents — list all documents
router.get('/', listDocuments);

// GET /api/documents/:id — get document details
router.get('/:id', getDocument);

// DELETE /api/documents/:id — delete a document
router.delete('/:id', deleteDocument);

module.exports = router;

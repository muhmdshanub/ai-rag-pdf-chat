const express = require('express');
const upload = require('../middleware/upload');
const { validateParams } = require('../middleware/validation.middleware');
const { documentIdParamSchema } = require('../schemas/document.schema');
const { uploadDocument } = require('../controllers/upload.controller');

const router = express.Router();

// POST /api/upload — upload a single PDF/TXT file
router.post('/', upload, uploadDocument);

// GET /api/upload/:documentId/progress — check processing status
const { getUploadProgress } = require('../controllers/upload.controller');
router.get('/:documentId/progress', validateParams(documentIdParamSchema), getUploadProgress);

module.exports = router;

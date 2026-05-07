const express = require('express');
const upload = require('../middleware/upload');
const { uploadDocument } = require('../controllers/upload.controller');

const router = express.Router();

// POST /api/upload — upload a single PDF/TXT file
router.post('/', upload.single('file'), uploadDocument);

module.exports = router;

const express = require('express');
const { validateBody } = require('../middleware/validation.middleware');
const { chatRequestSchema } = require('../schemas/chat.schema');
const { chat } = require('../controllers/chat.controller');

const router = express.Router();

// POST /api/chat — send a question about a document
router.post('/', validateBody(chatRequestSchema), chat);

module.exports = router;

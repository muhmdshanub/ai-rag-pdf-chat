const express = require('express');
const { validateBody } = require('../middleware/validation.middleware');
const { chatRequestSchema } = require('../schemas/chat.schema');
const { chat, chatStream } = require('../controllers/chat.controller');

const router = express.Router();

// POST /api/chat — send a question about a document (standard JSON)
router.post('/', validateBody(chatRequestSchema), chat);

// POST /api/chat/stream — send a question about a document (real-time SSE streaming)
router.post('/stream', validateBody(chatRequestSchema), chatStream);

module.exports = router;

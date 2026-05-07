const express = require('express');
const { validateChatRequest } = require('../middleware/validate');
const { chat } = require('../controllers/chat.controller');

const router = express.Router();

// POST /api/chat — send a question about a document
router.post('/', validateChatRequest, chat);

module.exports = router;

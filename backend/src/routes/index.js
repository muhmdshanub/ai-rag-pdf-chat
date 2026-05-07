const express = require('express');
const healthRoutes = require('./health.routes');
const uploadRoutes = require('./upload.routes');
const chatRoutes = require('./chat.routes');
const documentRoutes = require('./document.routes');

const router = express.Router();

// Mount all route modules
router.use('/health', healthRoutes);
router.use('/upload', uploadRoutes);
router.use('/chat', chatRoutes);
router.use('/documents', documentRoutes);

module.exports = router;

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const routes = require('./routes');
const requestLogger = require('./middleware/request-logger');
const errorHandler = require('./middleware/error-handler');

const app = express();

// ==================== MIDDLEWARE ====================

// CORS
app.use(cors({
  origin: config.corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Serve uploaded files statically (for development/debugging)
app.use('/uploads', express.static(config.uploadDir));

// ==================== ROUTES ====================

app.use('/api', routes);

// ==================== ERROR HANDLING ====================

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;

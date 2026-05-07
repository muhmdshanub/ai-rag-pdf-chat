/**
 * Custom error classes for consistent error handling
 */

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 422);
  }
}

class ExternalServiceError extends AppError {
  constructor(service, message) {
    super(`${service} error: ${message}`, 503);
    this.service = service;
  }
}

/**
 * ServiceError — reusable error for all internal service-layer failures.
 *
 * Replaces per-service error classes (PDFParsingError, ChunkingError, etc.)
 * Every service throws the same class; the `service` and `code` fields
 * identify where the error came from and what went wrong.
 *
 * @param {string} service  - Service name (e.g. 'PDFParser', 'Chunking')
 * @param {string} message  - Human-readable description
 * @param {string} code     - Machine-readable code (e.g. 'FILE_NOT_FOUND')
 * @param {Error}  [originalError] - The underlying error, if any
 */
class ServiceError extends AppError {
  constructor(service, message, code, originalError = null) {
    super(message, 500);
    this.code = code;
    this.service = service;
    this.originalError = originalError;
  }
}

module.exports = {
  AppError,
  NotFoundError,
  BadRequestError,
  ValidationError,
  ExternalServiceError,
  ServiceError,
};

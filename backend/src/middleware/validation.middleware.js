/**
 * Validation Middleware
 *
 * Provides Express middleware for validating request payloads against Joi schemas.
 * Ensures controllers only receive syntactically valid data.
 */

const { ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Validates request body against a Joi schema
 * @param {import('joi').ObjectSchema} schema 
 */
const validateBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true, // Remove keys not defined in the schema
  });

  if (error) {
    const errorMessages = error.details.map((detail) => detail.message).join(', ');
    logger.warn('Request body validation failed', { error: errorMessages, path: req.originalUrl });
    
    return res.status(400).json({
      success: false,
      error: `Validation Error: ${errorMessages}`,
      code: 'VALIDATION_ERROR',
    });
  }

  // Override req.body with the validated (and potentially coerced/stripped) value
  req.body = value;
  next();
};

/**
 * Validates request params against a Joi schema
 * @param {import('joi').ObjectSchema} schema 
 */
const validateParams = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.params, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errorMessages = error.details.map((detail) => detail.message).join(', ');
    logger.warn('Request params validation failed', { error: errorMessages, path: req.originalUrl });

    return res.status(400).json({
      success: false,
      error: `Validation Error: ${errorMessages}`,
      code: 'VALIDATION_ERROR',
    });
  }

  req.params = value;
  next();
};

/**
 * Validates request query string against a Joi schema
 * @param {import('joi').ObjectSchema} schema 
 */
const validateQuery = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errorMessages = error.details.map((detail) => detail.message).join(', ');
    logger.warn('Request query validation failed', { error: errorMessages, path: req.originalUrl });

    return res.status(400).json({
      success: false,
      error: `Validation Error: ${errorMessages}`,
      code: 'VALIDATION_ERROR',
    });
  }

  req.query = value;
  next();
};

module.exports = {
  validateBody,
  validateParams,
  validateQuery,
};

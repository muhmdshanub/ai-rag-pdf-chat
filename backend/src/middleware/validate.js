const { BadRequestError } = require('../utils/errors');

/**
 * Generic request body validation middleware factory
 * @param {string[]} requiredFields - Array of required field names
 * @returns {Function} Express middleware
 */
const validateBody = (requiredFields) => {
  return (req, res, next) => {
    const missing = requiredFields.filter((field) => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });

    if (missing.length > 0) {
      throw new BadRequestError(
        `Missing required fields: ${missing.join(', ')}`
      );
    }

    next();
  };
};

/**
 * Validate chat request body
 */
const validateChatRequest = validateBody(['documentId', 'message']);

module.exports = {
  validateBody,
  validateChatRequest,
};

/**
 * Chat Validation Schemas
 *
 * Defines the expected shape of requests to the chat endpoints.
 */

const Joi = require('joi');

const chatRequestSchema = Joi.object({
  documentId: Joi.number().integer().positive().required().messages({
    'number.base': 'documentId must be a number',
    'number.integer': 'documentId must be an integer',
    'number.positive': 'documentId must be a positive number',
    'any.required': 'documentId is required',
  }),
  message: Joi.string().trim().min(1).max(2000).required().messages({
    'string.base': 'message must be a string',
    'string.empty': 'message cannot be empty',
    'string.min': 'message cannot be empty',
    'string.max': 'message cannot exceed 2000 characters',
    'any.required': 'message is required',
  }),
  model: Joi.string().trim().optional().messages({
    'string.base': 'model must be a string'
  })
});

module.exports = {
  chatRequestSchema,
};

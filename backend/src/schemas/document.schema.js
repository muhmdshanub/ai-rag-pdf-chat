/**
 * Document/Upload Validation Schemas
 *
 * Defines the expected shape of requests to the upload and document endpoints.
 */

const Joi = require('joi');

const documentIdParamSchema = Joi.object({
  documentId: Joi.number().integer().positive().required().messages({
    'number.base': 'documentId parameter must be a number',
    'number.integer': 'documentId parameter must be an integer',
    'number.positive': 'documentId parameter must be a positive number',
    'any.required': 'documentId parameter is required',
  }),
});

module.exports = {
  documentIdParamSchema,
};

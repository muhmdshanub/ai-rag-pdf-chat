const dotenv = require('dotenv');
const Joi = require('joi');

// Load .env file only in non-Docker environments
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const isTest = process.env.NODE_ENV === 'test';

// Enterprise Best Practice: Fail-Fast Configuration Validation
const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(5000),
  
  DATABASE_URL: isTest ? Joi.string().optional().default('postgres://test') : Joi.string().required().description('PostgreSQL connection string'),
  REDIS_URL: isTest ? Joi.string().optional().default('redis://test') : Joi.string().required().description('Redis connection string'),
  
  GROQ_API_KEY: Joi.string().allow('').optional().description('Groq API Key for LLM'),
  HUGGINGFACE_API_KEY: isTest ? Joi.string().optional().default('test-key') : Joi.string().required().description('HuggingFace API Key for embeddings'),
  HUGGINGFACE_API_URL: Joi.string().uri().optional(),
  
  PDF_PARSER_MAX_FILE_SIZE: Joi.number().default(104857600),
  UPLOAD_DIR: Joi.string().default('./uploads'),
  PDF_PARSER_EXTRACTION_TIMEOUT: Joi.number().default(60000),
  
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
}).unknown(true);

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const config = {
  // Server
  port: envVars.PORT,
  nodeEnv: envVars.NODE_ENV,
  isDev: envVars.NODE_ENV === 'development',

  // Database
  databaseUrl: envVars.DATABASE_URL,

  // Redis
  redisUrl: envVars.REDIS_URL,

  // AI APIs
  groqApiKey: envVars.GROQ_API_KEY,
  huggingfaceApiKey: envVars.HUGGINGFACE_API_KEY,
  huggingfaceApiUrl: envVars.HUGGINGFACE_API_URL,

  // File Upload
  maxFileSize: envVars.PDF_PARSER_MAX_FILE_SIZE,
  uploadDir: envVars.UPLOAD_DIR,
  extractionTimeout: envVars.PDF_PARSER_EXTRACTION_TIMEOUT,

  // CORS
  corsOrigins: envVars.CORS_ORIGINS.split(','),
};

module.exports = config;

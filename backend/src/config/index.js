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

  // LLM Configuration
  LLM_DEFAULT_MODEL: Joi.string().default('llama-3-70b-8192'),
  LLM_DEFAULT_TEMPERATURE: Joi.number().min(0).max(2).default(0.1),
  LLM_MAX_TOKENS: Joi.number().integer().min(1).max(4096).default(1024),

  // RAG Configuration
  RAG_RECALL_K: Joi.number().integer().min(1).max(100).default(30),
  RAG_MIN_SIMILARITY: Joi.number().min(0).max(1).default(0.4),
  RAG_MAX_CONTEXT_CHARS: Joi.number().integer().min(500).max(50000).default(12000), // ~3000-4000 tokens
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

  // LLM Settings
  llm: {
    defaultModel: envVars.LLM_DEFAULT_MODEL,
    defaultTemperature: envVars.LLM_DEFAULT_TEMPERATURE,
    maxTokens: envVars.LLM_MAX_TOKENS,
    models: {
      'llama-3-70b-8192': { name: 'Llama 3 70B', costPer1k: 0.0007 },
      'mixtral-8x7b-32768': { name: 'Mixtral 8x7B', costPer1k: 0.0005 }
    }
  },

  // RAG Settings
  rag: {
    recallK: envVars.RAG_RECALL_K,
    minSimilarity: envVars.RAG_MIN_SIMILARITY,
    maxContextChars: envVars.RAG_MAX_CONTEXT_CHARS,
    gapThreshold: 0.15,
    defaultSystemPrompt: `You are a helpful AI assistant answering questions based strictly on the provided document context.

Guidelines:
1. Use ONLY information from the provided context.
2. If the context doesn't contain the answer, say "The provided context doesn't contain information about this."
3. Cite which chunk numbers you are using.
4. Be clear and concise.
5. Do not make up information or use outside knowledge.`
  },

  // File Upload
  maxFileSize: envVars.PDF_PARSER_MAX_FILE_SIZE,
  uploadDir: envVars.UPLOAD_DIR,
  extractionTimeout: envVars.PDF_PARSER_EXTRACTION_TIMEOUT,

  // CORS
  corsOrigins: envVars.CORS_ORIGINS.split(','),
};

module.exports = config;

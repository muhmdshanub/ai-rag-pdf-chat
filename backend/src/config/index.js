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
  LLM_DEFAULT_MODEL: Joi.string().default('llama-3.3-70b-versatile'),
  LLM_DEFAULT_TEMPERATURE: Joi.number().min(0).max(2).default(0.1),
  LLM_MAX_TOKENS: Joi.number().integer().min(1).max(32768).default(1024),

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
    // Groq Production Models (Free on Developer Plan, rate-limited)
    // Pricing is per 1M tokens (for reference only — developer plan is free)
    // Docs: https://console.groq.com/docs/models
    models: {
      'llama-3.3-70b-versatile': {
        name: 'Meta Llama 3.3 70B Versatile',
        contextWindow: 131072,
        maxCompletionTokens: 32768,
        speedTps: 280,
        inputCostPer1m: 0.59,   // USD per 1M input tokens
        outputCostPer1m: 0.79,  // USD per 1M output tokens
        recommended: true,      // Best accuracy for RAG — strong instruction following
      },
      'llama-3.1-8b-instant': {
        name: 'Meta Llama 3.1 8B Instant',
        contextWindow: 131072,
        maxCompletionTokens: 131072,
        speedTps: 560,
        inputCostPer1m: 0.05,   // USD per 1M input tokens
        outputCostPer1m: 0.08,  // USD per 1M output tokens
        recommended: false,     // Faster but less accurate — use as fallback
      }
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

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
  RAG_MIN_SIMILARITY: Joi.number().min(0).max(1).default(0.25),
  RAG_MAX_CONTEXT_CHARS: Joi.number().integer().min(500).max(50000).default(12000), // ~3000-4000 tokens

  // Query Rewriter Configuration
  RAG_QUERY_REWRITER_ENABLED: Joi.boolean().default(true),
  RAG_QUERY_REWRITER_MODEL: Joi.string().default('llama-3.1-8b-instant'),
  RAG_QUERY_REWRITER_TIMEOUT_MS: Joi.number().integer().min(100).max(10000).default(2000),

  // MMR Configuration
  RAG_MMR_ENABLED: Joi.boolean().default(true),
  RAG_MMR_LAMBDA: Joi.number().min(0).max(1).default(0.7),

  // Re-ranking Configuration
  RAG_RERANKER_ENABLED: Joi.boolean().default(false), // Off by default (requires API quota)
  RAG_RERANKER_MODEL: Joi.string().default('cross-encoder/ms-marco-MiniLM-L-6-v2'),

  // Chunking Configuration
  CHUNKING_CHUNK_SIZE: Joi.number().integer().min(100).max(5000).default(800),
  CHUNKING_OVERLAP_SIZE: Joi.number().integer().min(0).max(1000).default(200),
  CHUNKING_MIN_CHUNK_SIZE: Joi.number().integer().min(10).default(50),
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
3. When stating a fact, you MUST append the source citation number in brackets IMMEDIATELY after the specific fact (e.g. "He is an engineer [1] living in NY [2]."). Do not group them all at the end of the sentence.
4. NEVER use the words "chunk", "context", or "document" in your response. Answer naturally.
5. Be clear and concise. Do not make up information.`,
    queryRewriter: {
      enabled: envVars.RAG_QUERY_REWRITER_ENABLED,
      model: envVars.RAG_QUERY_REWRITER_MODEL,
      timeoutMs: envVars.RAG_QUERY_REWRITER_TIMEOUT_MS,
    },
    mmr: {
      enabled: envVars.RAG_MMR_ENABLED,
      lambda: envVars.RAG_MMR_LAMBDA,
    },
    reranker: {
      enabled: envVars.RAG_RERANKER_ENABLED,
      model: envVars.RAG_RERANKER_MODEL,
    },
  },

  // Chunking Settings
  chunking: {
    chunkSize: envVars.CHUNKING_CHUNK_SIZE,
    overlapSize: envVars.CHUNKING_OVERLAP_SIZE,
    minChunkSize: envVars.CHUNKING_MIN_CHUNK_SIZE,
  },

  // File Upload
  maxFileSize: envVars.PDF_PARSER_MAX_FILE_SIZE,
  uploadDir: envVars.UPLOAD_DIR,
  extractionTimeout: envVars.PDF_PARSER_EXTRACTION_TIMEOUT,

  // CORS
  corsOrigins: envVars.CORS_ORIGINS.split(','),
};

module.exports = config;

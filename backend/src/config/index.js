const dotenv = require('dotenv');

// Load .env file only in non-Docker environments
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://dev:dev123@localhost:5432/rag_chat',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // AI APIs
  groqApiKey: process.env.GROQ_API_KEY || '',
  huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY || '',

  // File Upload
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024, // 10MB
  uploadDir: process.env.UPLOAD_DIR || './uploads',

  // CORS
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:3000'],
};

module.exports = config;

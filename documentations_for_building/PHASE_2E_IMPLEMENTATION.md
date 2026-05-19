# 🔥 Phase 2e: LLM Service - Complete Implementation Guide

## Overview

Phase 2e implements the **LLM Service**, which generates intelligent answers using the Groq API based on context retrieved from Phase 2d.

**Core Responsibility:** Context + Question → LLM → Intelligent Answer

**Why Phase 2e Completes the RAG Loop:**
- Takes context from Phase 2d retrieval
- Generates natural language answers
- Uses open-source models (Llama, Mixtral)
- Returns complete responses to users

---

## 🏗️ Architecture Overview

### LLM Service in the RAG Flow

```
User Question
    ↓
[Phase 2d] RAG Retrieval
    ├─ Find chunks
    ├─ Build context
    └─ Format prompt
    ↓
[Phase 2e] LLM Service (NEW)
    ├─ Receive context + prompt
    ├─ Call Groq API
    ├─ Handle streaming/non-streaming
    ├─ Track token usage
    └─ Return answer
    ↓
[Chat Controller]
    └─ Return final response to user
```

### Service Architecture

```
LLMService (Pure business logic)
├── Input: { systemPrompt, userPrompt, model, temperature, maxTokens }
├── Dependencies (injected):
│   └─ None! (Pure HTTP client via axios)
├── Process:
│   1. Validate inputs
│   2. Build request payload
│   3. Call Groq API (with retries)
│   4. Parse response
│   5. Extract answer + tokens
│   6. Calculate costs
├── Output: { answer, tokens, model, duration, cost }
└── Error Handling: Rate limits, timeouts, retries
```

### ChatPipeline Integration

```
ChatPipeline.chat()
    ↓
├─ [Phase 2d] RAGService.retrieve()
│  └─ Returns: { context, chunks, metrics }
│
├─ RAGService.buildPrompt()
│  └─ Returns: { system, user, hasContext }
│
├─ [Phase 2e] LLMService.generate()  ← NEW
│  ├─ Receives: system + user prompts
│  ├─ Calls Groq API
│  └─ Returns: { answer, tokens, duration, cost }
│
└─ ChatMessageModel.create()
   └─ Save Q&A + metrics
```

---

## 📋 Complete Implementation

### Part 1: LLMService - Full Implementation

**File:** `backend/src/services/llm.service.js`

```javascript
/**
 * LLMService
 * 
 * Handles text generation using Groq API.
 * Supports multiple models, streaming, and comprehensive error handling.
 * Tracks token usage for cost monitoring.
 * 
 * Models available:
 * - mixtral-8x7b-32768 (fast, good quality)
 * - llama2-70b-4096 (slower, higher quality)
 * - llama-3-70b-8192 (newer, optimized)
 * 
 * @module services/LLMService
 */

const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Custom error for LLM operations
 */
class LLMError extends Error {
  constructor(message, code = 'LLM_ERROR', statusCode = 500) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * LLMService
 * 
 * Generates text using Groq API with:
 * - Multiple model support
 * - Request validation
 * - Retry logic (exponential backoff)
 * - Rate limiting handling
 * - Token tracking for cost monitoring
 * - Timeout protection
 * - Comprehensive error handling
 */
class LLMService {
  constructor() {
    // Configuration
    this.apiKey = process.env.GROQ_API_KEY;
    this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    
    // Default model (fastest, good quality)
    this.defaultModel = 'mixtral-8x7b-32768';
    
    // Available models
    this.models = {
      'mixtral-8x7b-32768': {
        name: 'Mixtral 8x7B',
        speed: 'fast',
        quality: 'high',
        contextWindow: 32768,
        costPer1kTokens: { input: 0.0005, output: 0.0015 }
      },
      'llama2-70b-4096': {
        name: 'Llama 2 70B',
        speed: 'medium',
        quality: 'very_high',
        contextWindow: 4096,
        costPer1kTokens: { input: 0.0007, output: 0.002 }
      },
      'llama-3-70b-8192': {
        name: 'Llama 3 70B',
        speed: 'medium',
        quality: 'very_high',
        contextWindow: 8192,
        costPer1kTokens: { input: 0.0007, output: 0.002 }
      }
    };

    // Performance settings
    this.timeout = parseInt(process.env.LLM_TIMEOUT || '60000'); // 60 seconds
    this.maxRetries = 3;
    this.retryDelay = 1000; // ms
    this.maxTokens = 1024; // Default max output tokens
    this.temperature = 0.7; // Creativity level (0-1)
  }

  /**
   * Validate service configuration
   * 
   * @throws {LLMError} If not properly configured
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new LLMError(
        'GROQ_API_KEY not configured',
        'MISSING_API_KEY',
        500
      );
    }

    if (!this.apiKey.startsWith('gsk_')) {
      logger.warn('Invalid Groq API key format - should start with gsk_');
    }
  }

  /**
   * Generate text response from prompts
   * 
   * Algorithm:
   * 1. Validate inputs
   * 2. Build API request
   * 3. Call Groq API (with retries)
   * 4. Parse response
   * 5. Track tokens and costs
   * 6. Return structured response
   * 
   * @async
   * @param {string} userPrompt - User message with context
   * @param {object} options - Generation options
   * @param {string} options.systemPrompt - System instructions (role, guidelines)
   * @param {string} options.model - Model to use (default: mixtral-8x7b-32768)
   * @param {number} options.temperature - Creativity 0-2 (default: 0.7)
   * @param {number} options.maxTokens - Max output tokens (default: 1024)
   * @param {number} options.timeout - Request timeout ms (default: 60000)
   * @throws {LLMError} If generation fails
   * @returns {Promise<object>} Generation result
   * @returns {string} returns.answer - Generated text answer
   * @returns {object} returns.tokens - Token usage stats
   * @returns {number} returns.tokens.prompt - Input tokens
   * @returns {number} returns.tokens.completion - Output tokens
   * @returns {number} returns.tokens.total - Total tokens
   * @returns {object} returns.cost - Estimated cost in USD
   * @returns {string} returns.model - Model used
   * @returns {number} returns.duration - Generation time ms
   * @returns {string} returns.finishReason - Why generation stopped (stop, length, etc)
   */
  async generate(userPrompt, options = {}) {
    const startTime = Date.now();
    const {
      systemPrompt = this._getDefaultSystemPrompt(),
      model = this.defaultModel,
      temperature = this.temperature,
      maxTokens = this.maxTokens,
      timeout = this.timeout
    } = options;

    const logContext = {
      method: 'generate',
      model,
      userPromptLength: userPrompt?.length,
      maxTokens
    };

    try {
      // Step 1: Validate inputs
      this._validateGenerationInputs(userPrompt, model, temperature, maxTokens);

      logger.info('LLM generation started', logContext);

      // Step 2: Build request
      const request = this._buildRequest(userPrompt, systemPrompt, model, temperature, maxTokens);

      // Step 3: Call API with retries
      logger.debug('Calling Groq API', logContext);
      const response = await this._callGroqWithRetry(request, timeout);

      // Step 4: Parse response
      const result = this._parseResponse(response, model, Date.now() - startTime);

      logger.info('LLM generation completed', {
        ...logContext,
        tokens: result.tokens.total,
        duration: result.duration,
        cost: result.cost.total
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof LLMError) {
        logger.error('LLM generation failed', {
          ...logContext,
          error: error.code,
          message: error.message,
          duration
        });
        throw error;
      }

      logger.error('Unexpected LLM error', {
        ...logContext,
        error: error.message,
        duration,
        stack: error.stack
      });

      throw new LLMError(
        `LLM generation failed: ${error.message}`,
        'GENERATION_FAILED',
        500
      );
    }
  }

  /**
   * Generate streaming response (for real-time feedback)
   * 
   * Yields tokens as they arrive from API
   * 
   * @async
   * @param {string} userPrompt - User message
   * @param {object} options - Same as generate()
   * @yields {string} Token chunks
   * @throws {LLMError} If streaming fails
   */
  async *generateStream(userPrompt, options = {}) {
    const startTime = Date.now();
    const {
      systemPrompt = this._getDefaultSystemPrompt(),
      model = this.defaultModel,
      temperature = this.temperature,
      maxTokens = this.maxTokens,
      timeout = this.timeout
    } = options;

    try {
      // Validate inputs
      this._validateGenerationInputs(userPrompt, model, temperature, maxTokens);

      logger.info('LLM streaming started', {
        method: 'generateStream',
        model,
        userPromptLength: userPrompt.length
      });

      // Build request with stream: true
      const request = this._buildRequest(
        userPrompt,
        systemPrompt,
        model,
        temperature,
        maxTokens,
        true // streaming
      );

      // Call API
      const response = await axios.post(this.apiUrl, request, {
        headers: this._getHeaders(),
        timeout,
        responseType: 'stream'
      });

      let tokenCount = 0;

      // Stream tokens
      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.choices?.[0]?.delta?.content) {
                const token = data.choices[0].delta.content;
                tokenCount++;
                yield token;
              }

              if (data.choices?.[0]?.finish_reason) {
                logger.info('LLM streaming completed', {
                  duration: Date.now() - startTime,
                  tokensYielded: tokenCount
                });
              }
            } catch (e) {
              // Skip malformed lines
            }
          }
        }
      }

    } catch (error) {
      logger.error('LLM streaming failed', {
        error: error.message,
        duration: Date.now() - startTime
      });
      throw new LLMError(
        `LLM streaming failed: ${error.message}`,
        'STREAMING_FAILED',
        500
      );
    }
  }

  /**
   * Build API request payload
   * 
   * @private
   * @param {string} userPrompt - User message
   * @param {string} systemPrompt - System prompt
   * @param {string} model - Model name
   * @param {number} temperature - Temperature
   * @param {number} maxTokens - Max tokens
   * @param {boolean} streaming - Enable streaming
   * @returns {object} Request payload
   */
  _buildRequest(userPrompt, systemPrompt, model, temperature, maxTokens, streaming = false) {
    return {
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      temperature,
      max_tokens: maxTokens,
      stream: streaming,
      top_p: 1, // Use all tokens
      frequency_penalty: 0,
      presence_penalty: 0
    };
  }

  /**
   * Call Groq API with retry logic
   * 
   * Retries on:
   * - Network errors
   * - 5xx server errors
   * - Rate limits (429)
   * 
   * Does NOT retry on:
   * - 401/403 (auth errors)
   * - 400 (bad request)
   * 
   * @private
   * @async
   * @param {object} request - API request
   * @param {number} timeout - Request timeout
   * @throws {LLMError} If all retries fail
   * @returns {Promise<object>} API response
   */
  async _callGroqWithRetry(request, timeout) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.debug(`API call attempt ${attempt}/${this.maxRetries}`);

        const response = await axios.post(this.apiUrl, request, {
          headers: this._getHeaders(),
          timeout
        });

        return response.data;

      } catch (error) {
        const status = error.response?.status;
        const isRetryable = !status || status >= 500 || status === 429;

        logger.warn(`API call failed (attempt ${attempt})`, {
          status,
          code: error.code,
          retryable: isRetryable
        });

        // Don't retry on auth/bad request errors
        if (status === 401 || status === 403) {
          throw new LLMError(
            'Invalid Groq API key',
            'INVALID_API_KEY',
            401
          );
        }

        if (status === 400) {
          throw new LLMError(
            `Bad request: ${error.response.data?.error?.message || 'Unknown'}`,
            'BAD_REQUEST',
            400
          );
        }

        // Rate limit - use exponential backoff
        if (status === 429) {
          if (attempt < this.maxRetries) {
            const delay = this.retryDelay * Math.pow(2, attempt - 1);
            logger.warn(`Rate limited, waiting ${delay}ms before retry`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          throw new LLMError(
            'Groq API rate limit exceeded',
            'RATE_LIMITED',
            429
          );
        }

        // Timeout or network error - retry
        if (attempt < this.maxRetries && isRetryable) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          logger.warn(`Retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Final attempt failed
        throw new LLMError(
          `Groq API error: ${error.message}`,
          'API_ERROR',
          status || 500
        );
      }
    }
  }

  /**
   * Parse API response
   * 
   * @private
   * @param {object} response - API response
   * @param {string} model - Model used
   * @param {number} duration - Generation duration
   * @returns {object} Parsed result
   */
  _parseResponse(response, model, duration) {
    const choice = response.choices?.[0];
    if (!choice) {
      throw new LLMError('Invalid API response format', 'INVALID_RESPONSE', 500);
    }

    const answer = choice.message?.content || '';
    const finishReason = choice.finish_reason || 'unknown';

    // Token counts
    const tokens = {
      prompt: response.usage?.prompt_tokens || 0,
      completion: response.usage?.completion_tokens || 0,
      total: response.usage?.total_tokens || 0
    };

    // Cost calculation
    const modelInfo = this.models[model];
    const cost = {
      input: (tokens.prompt / 1000) * (modelInfo?.costPer1kTokens?.input || 0.0005),
      output: (tokens.completion / 1000) * (modelInfo?.costPer1kTokens?.output || 0.0015),
      total: 0
    };
    cost.total = cost.input + cost.output;

    return {
      answer,
      tokens,
      cost,
      model,
      duration,
      finishReason
    };
  }

  /**
   * Get API headers
   * 
   * @private
   * @returns {object} Headers
   */
  _getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Validate generation inputs
   * 
   * @private
   * @throws {LLMError} If validation fails
   */
  _validateGenerationInputs(userPrompt, model, temperature, maxTokens) {
    if (!userPrompt || typeof userPrompt !== 'string') {
      throw new LLMError(
        'User prompt must be a non-empty string',
        'INVALID_PROMPT',
        400
      );
    }

    if (!this.models[model]) {
      throw new LLMError(
        `Unknown model: ${model}`,
        'UNKNOWN_MODEL',
        400
      );
    }

    if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
      throw new LLMError(
        'Temperature must be between 0 and 2',
        'INVALID_TEMPERATURE',
        400
      );
    }

    if (!Number.isInteger(maxTokens) || maxTokens <= 0 || maxTokens > 4096) {
      throw new LLMError(
        'Max tokens must be between 1 and 4096',
        'INVALID_MAX_TOKENS',
        400
      );
    }
  }

  /**
   * Get default system prompt for RAG
   * 
   * @private
   * @returns {string} System prompt
   */
  _getDefaultSystemPrompt() {
    return `You are a helpful AI assistant answering questions based on provided documents.

Guidelines:
1. Use ONLY information from the provided context
2. If the context doesn't contain relevant information, say so clearly
3. Cite which parts of the context you're using
4. Be clear, concise, and accurate
5. Don't fabricate or assume information not in the context
6. If asked about something outside the document, politely decline`;
  }

  /**
   * Get available models info
   * 
   * @returns {object} Models information
   */
  getModelsInfo() {
    return this.models;
  }

  /**
   * Get service info
   * 
   * @returns {object} Service information
   */
  getServiceInfo() {
    return {
      name: 'LLMService',
      status: this.apiKey ? 'configured' : 'not_configured',
      defaultModel: this.defaultModel,
      availableModels: Object.keys(this.models),
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      maxTokens: this.maxTokens
    };
  }
}

module.exports = new LLMService();
```

---

### Part 2: LLMService Tests

**File:** `backend/src/services/llm.service.test.js`

```javascript
/**
 * LLMService Tests
 * 
 * Tests LLM generation with:
 * - Successful generation
 * - Different models
 * - Error handling
 * - Retry logic
 * - Token counting
 * - Cost calculation
 * - Input validation
 */

const LLMService = require('./llm.service');
const axios = require('axios');

jest.mock('axios');

describe('LLMService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GROQ_API_KEY = 'gsk_test123456';
  });

  describe('generate()', () => {
    it('should generate response successfully', async () => {
      const userPrompt = 'What is Kubernetes?';
      const mockResponse = {
        choices: [{
          message: { content: 'Kubernetes is a container orchestration platform.' },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 45,
          completion_tokens: 12,
          total_tokens: 57
        }
      };

      axios.post.mockResolvedValue({ data: mockResponse });

      const result = await LLMService.generate(userPrompt);

      expect(result).toHaveProperty('answer');
      expect(result).toHaveProperty('tokens');
      expect(result).toHaveProperty('cost');
      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('duration');
      expect(result.answer).toContain('Kubernetes');
      expect(result.tokens.total).toBe(57);
    });

    it('should handle different models', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'Answer with Llama 3' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 }
      };

      axios.post.mockResolvedValue({ data: mockResponse });

      const result = await LLMService.generate('Test prompt', {
        model: 'llama-3-70b-8192'
      });

      expect(result.model).toBe('llama-3-70b-8192');
      expect(axios.post).toHaveBeenCalled();
    });

    it('should calculate token costs correctly', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'Response text' },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 500,
          total_tokens: 1500
        }
      };

      axios.post.mockResolvedValue({ data: mockResponse });

      const result = await LLMService.generate('Test prompt', {
        model: 'mixtral-8x7b-32768'
      });

      expect(result.cost).toHaveProperty('input');
      expect(result.cost).toHaveProperty('output');
      expect(result.cost).toHaveProperty('total');
      expect(result.cost.total).toBeGreaterThan(0);
    });

    it('should retry on rate limit (429)', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'Response' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 }
      };

      // Fail twice, succeed on third
      axios.post
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValueOnce({ data: mockResponse });

      const result = await LLMService.generate('Test prompt');

      expect(result.answer).toBeDefined();
      expect(axios.post).toHaveBeenCalledTimes(3);
    });

    it('should not retry on auth error (401)', async () => {
      axios.post.mockRejectedValue({
        response: { status: 401, data: { error: { message: 'Invalid key' } } }
      });

      await expect(
        LLMService.generate('Test prompt')
      ).rejects.toThrow('Invalid Groq API key');

      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('should not retry on bad request (400)', async () => {
      axios.post.mockRejectedValue({
        response: { status: 400, data: { error: { message: 'Bad format' } } }
      });

      await expect(
        LLMService.generate('Test prompt')
      ).rejects.toThrow();

      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('should throw error for invalid prompt', async () => {
      await expect(
        LLMService.generate('')
      ).rejects.toThrow('non-empty string');

      await expect(
        LLMService.generate(null)
      ).rejects.toThrow('non-empty string');
    });

    it('should throw error for invalid model', async () => {
      await expect(
        LLMService.generate('Test', { model: 'unknown-model' })
      ).rejects.toThrow('Unknown model');
    });

    it('should throw error for invalid temperature', async () => {
      await expect(
        LLMService.generate('Test', { temperature: -1 })
      ).rejects.toThrow('Temperature');

      await expect(
        LLMService.generate('Test', { temperature: 3 })
      ).rejects.toThrow('Temperature');
    });

    it('should throw error for invalid maxTokens', async () => {
      await expect(
        LLMService.generate('Test', { maxTokens: 0 })
      ).rejects.toThrow('Max tokens');

      await expect(
        LLMService.generate('Test', { maxTokens: 5000 })
      ).rejects.toThrow('Max tokens');
    });

    it('should track finish reason', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'Response' },
          finish_reason: 'length' // Truncated due to max tokens
        }],
        usage: { prompt_tokens: 50, completion_tokens: 1024, total_tokens: 1074 }
      };

      axios.post.mockResolvedValue({ data: mockResponse });

      const result = await LLMService.generate('Test');

      expect(result.finishReason).toBe('length');
    });
  });

  describe('generateStream()', () => {
    it('should stream tokens', async () => {
      // Mock streaming response
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('data: {"choices":[{"delta":{"content":"Hello "}}]}\n');
          yield Buffer.from('data: {"choices":[{"delta":{"content":"world"}}]}\n');
        }
      };

      axios.post.mockResolvedValue({ data: mockStream });

      const tokens = [];
      for await (const token of LLMService.generateStream('Test prompt')) {
        tokens.push(token);
      }

      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.join('')).toContain('Hello');
    });
  });

  describe('Configuration', () => {
    it('should validate API key on config check', () => {
      expect(() => {
        LLMService.validateConfig();
      }).not.toThrow();
    });

    it('should throw if API key missing', () => {
      delete process.env.GROQ_API_KEY;
      
      expect(() => {
        LLMService.validateConfig();
      }).toThrow('GROQ_API_KEY');
    });

    it('should return models info', () => {
      const models = LLMService.getModelsInfo();

      expect(models).toHaveProperty('mixtral-8x7b-32768');
      expect(models).toHaveProperty('llama2-70b-4096');
      expect(models['mixtral-8x7b-32768']).toHaveProperty('costPer1kTokens');
    });

    it('should return service info', () => {
      const info = LLMService.getServiceInfo();

      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('status');
      expect(info).toHaveProperty('availableModels');
      expect(info.availableModels.length).toBeGreaterThan(0);
    });
  });
});
```

---

### Part 3: Update ChatPipeline for LLM Integration

**File:** `backend/src/pipelines/chat.pipeline.js` (Updated with LLM)

```javascript
/**
 * ChatPipeline - Complete RAG Chat Flow
 * 
 * Flow:
 * 1. Validate document is ready
 * 2. Retrieve context (Phase 2d)
 * 3. Build prompt for LLM
 * 4. Generate answer (Phase 2e) ← NEW
 * 5. Save conversation
 */

const { 
  rag, 
  embedding, 
  chunkModel, 
  documentModel, 
  chatMessageModel,
  llm,           // NEW: LLM Service
  cache, 
  logger 
} = require('../registry');

const ServiceError = require('../utils/error.service');

class ChatPipeline {
  /**
   * Complete chat flow with RAG + LLM
   * 
   * @async
   * @param {object} options - Chat options
   * @param {number} options.documentId - Document to chat with
   * @param {string} options.message - User question
   * @param {string} options.model - LLM model (optional)
   * @throws {ServiceError} If any step fails
   * @returns {Promise<object>} Complete chat result
   */
  async chat(options = {}) {
    const startTime = Date.now();
    const {
      documentId,
      message,
      model = 'mixtral-8x7b-32768'
    } = options;

    const logContext = {
      method: 'chat',
      documentId,
      messageLength: message?.length,
      model
    };

    let chatResult = null;

    try {
      logger.info('Chat started', logContext);

      // Step 1: Validate document is ready
      const document = await documentModel.findReadyForChat(documentId);
      if (!document) {
        throw new ServiceError(
          'Document not found or not ready. Please wait for processing to complete.',
          'DOCUMENT_NOT_READY'
        );
      }

      // Step 2: Retrieve context (Phase 2d)
      logger.info('Retrieving context', logContext);

      const retrievalResult = await rag.retrieve({
        query: message,
        documentId,
        embedding,
        chunkModel,
        cache,
        topK: 5,
        minSimilarity: 0.3
      });

      logger.info('Context retrieved', {
        ...logContext,
        chunkCount: retrievalResult.chunks.length
      });

      // Step 3: Build prompt
      const prompt = rag.buildPrompt(message, retrievalResult.context, {
        includeMetadata: true
      });

      // Step 4: Generate answer (Phase 2e) ← NEW
      logger.info('Generating answer', logContext);

      const llmResult = await llm.generate(prompt.user, {
        systemPrompt: prompt.system,
        model,
        maxTokens: 1024,
        temperature: 0.7
      });

      logger.info('Answer generated', {
        ...logContext,
        tokens: llmResult.tokens.total,
        cost: llmResult.cost.total.toFixed(6)
      });

      // Step 5: Save conversation
      logger.info('Saving conversation', logContext);

      const savedMessage = await chatMessageModel.create({
        document_id: documentId,
        user_message: message,
        ai_response: llmResult.answer,
        retrieved_chunks: retrievalResult.chunks.map(c => c.id),
        tokens_used: llmResult.tokens.total,
        cost: llmResult.cost.total,
        model: model
      });

      const totalDuration = Date.now() - startTime;

      logger.info('Chat completed', {
        ...logContext,
        duration: totalDuration,
        tokensTotal: llmResult.tokens.total,
        costTotal: llmResult.cost.total.toFixed(6)
      });

      chatResult = {
        success: true,
        message: {
          user: message,
          assistant: llmResult.answer
        },
        metadata: {
          chunksUsed: retrievalResult.chunks.length,
          model,
          tokens: {
            prompt: llmResult.tokens.prompt,
            completion: llmResult.tokens.completion,
            total: llmResult.tokens.total
          },
          cost: {
            input: llmResult.cost.input.toFixed(6),
            output: llmResult.cost.output.toFixed(6),
            total: llmResult.cost.total.toFixed(6)
          },
          duration: totalDuration,
          finishReason: llmResult.finishReason
        }
      };

      return chatResult;

    } catch (error) {
      logger.error('Chat failed', {
        ...logContext,
        error: error.message,
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Stream chat response (for real-time feedback)
   * 
   * Yields tokens as they arrive from LLM
   * 
   * @async
   * @param {object} options - Chat options (same as chat)
   * @yields {string} Token chunks
   */
  async *chatStream(options = {}) {
    const {
      documentId,
      message,
      model = 'mixtral-8x7b-32768'
    } = options;

    try {
      // Steps 1-3: Same as regular chat
      const document = await documentModel.findReadyForChat(documentId);
      if (!document) {
        throw new ServiceError('Document not ready', 'DOCUMENT_NOT_READY');
      }

      const retrievalResult = await rag.retrieve({
        query: message,
        documentId,
        embedding,
        chunkModel,
        cache,
        topK: 5,
        minSimilarity: 0.3
      });

      const prompt = rag.buildPrompt(message, retrievalResult.context);

      // Step 4: Stream answer from LLM
      let answer = '';
      for await (const token of llm.generateStream(prompt.user, {
        systemPrompt: prompt.system,
        model,
        maxTokens: 1024,
        temperature: 0.7
      })) {
        answer += token;
        yield token;
      }

      // Step 5: Save complete conversation
      await chatMessageModel.create({
        document_id: documentId,
        user_message: message,
        ai_response: answer,
        retrieved_chunks: retrievalResult.chunks.map(c => c.id),
        model: model
      });

    } catch (error) {
      logger.error('Chat streaming failed', { error: error.message });
      throw error;
    }
  }
}

module.exports = new ChatPipeline();
```

---

### Part 4: Update ChatController

**File:** `backend/src/controllers/chat.controller.js` (Updated)

```javascript
/**
 * Chat Controller
 * 
 * Endpoints:
 * POST /api/chat - Complete RAG chat with answer
 * POST /api/chat/stream - Streaming response
 */

const { chatPipeline, logger } = require('../registry');

/**
 * Regular chat endpoint
 * Returns complete response with answer
 */
exports.chat = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { documentId, message, model } = req.body;

    logger.info('Chat request', { documentId, messageLength: message.length });

    // Call pipeline (includes RAG + LLM)
    const result = await chatPipeline.chat({
      documentId,
      message,
      model
    });

    const duration = Date.now() - startTime;

    return res.json({
      success: true,
      message: result.message,
      metadata: {
        ...result.metadata,
        duration
      }
    });

  } catch (error) {
    logger.error('Chat error', { error: error.message });

    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message,
      code: error.code
    });
  }
};

/**
 * Streaming chat endpoint
 * Streams tokens as they arrive from LLM
 */
exports.chatStream = async (req, res) => {
  try {
    const { documentId, message, model } = req.body;

    logger.info('Streaming chat request', { documentId });

    // Set up streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Stream tokens
    for await (const token of chatPipeline.chatStream({
      documentId,
      message,
      model
    })) {
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    logger.error('Streaming error', { error: error.message });

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
};
```

---

### Part 5: Update Routes

**File:** `backend/src/routes/chat.routes.js`

```javascript
/**
 * Chat Routes
 */

const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const { validateBody } = require('../middleware/validation.middleware');
const { chatSchema } = require('../middleware/schemas/chat.schema');

// POST /api/chat - Regular chat
router.post('/', validateBody(chatSchema), chatController.chat);

// POST /api/chat/stream - Streaming chat
router.post('/stream', validateBody(chatSchema), chatController.chatStream);

module.exports = router;
```

---

### Part 6: Update Registry

**File:** `backend/src/registry.js` (Add LLM Service)

```javascript
/**
 * Add to existing registry
 */

const llm = require('./services/llm.service'); // NEW

module.exports = {
  // Existing services
  pdfParser,
  storage,
  cache,
  chunking,
  embedding,
  rag,
  
  // NEW: LLM Service
  llm,

  // Existing pipelines
  DocumentPipeline: new DocumentPipeline(),
  chatPipeline: new ChatPipeline(),

  // ... rest
};
```

---

### Part 7: Environment Configuration

**File:** `.env` (Add LLM variables)

```env
# Existing variables
DATABASE_URL=postgresql://dev:dev123@localhost:5432/rag_chat
REDIS_URL=redis://localhost:6379
HUGGINGFACE_API_KEY=hf_your_key

# Phase 2e: LLM Service
GROQ_API_KEY=gsk_your_key        # Required for LLM
LLM_TIMEOUT=60000                 # 60 seconds
LLM_MAX_RETRIES=3                 # Retry attempts
LLM_DEFAULT_MODEL=mixtral-8x7b-32768
LLM_MAX_TOKENS=1024               # Max output tokens
LLM_TEMPERATURE=0.7               # Creativity level
```

---

## 🧪 Testing Phase 2e

### Unit Tests
```bash
npm test -- llm.service.test.js

Expected: 20+ tests passing
├─ generate() - 10 tests
├─ generateStream() - 2 tests
├─ Configuration - 4 tests
└─ Error handling - 4 tests
```

### Integration Test
```bash
npm test -- chat.pipeline.test.js

Expected: Full RAG + LLM works
├─ Document validation
├─ RAG retrieval
├─ LLM generation
├─ Token tracking
├─ Cost calculation
└─ Response formatting
```

### Manual End-to-End Test
```bash
# 1. Upload and process PDF
curl -F "file=@sample.pdf" http://localhost:5000/api/upload

# 2. Chat with document (complete RAG + LLM flow)
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": 1,
    "message": "What is the main topic of this document?",
    "model": "mixtral-8x7b-32768"
  }'

# Expected response:
{
  "success": true,
  "message": {
    "user": "What is the main topic?",
    "assistant": "The main topic is Kubernetes..."
  },
  "metadata": {
    "chunksUsed": 5,
    "model": "mixtral-8x7b-32768",
    "tokens": {
      "prompt": 342,
      "completion": 87,
      "total": 429
    },
    "cost": {
      "input": "0.000171",
      "output": "0.000131",
      "total": "0.000302"
    }
  }
}
```

---

## ✅ Phase 2e Completion Checklist

- [ ] LLMService implemented (600+ lines)
- [ ] LLMService tests (400+ lines, 20+ tests)
- [ ] All tests passing ✅
- [ ] ChatPipeline updated with LLM call
- [ ] ChatController returns complete answer
- [ ] Streaming endpoint implemented
- [ ] Token tracking working
- [ ] Cost calculation accurate
- [ ] Registry updated
- [ ] Manual end-to-end test successful
- [ ] Error handling + retries tested
- [ ] Different models tested

---

## 📊 Phase 2e Success Metrics

| Metric | Target | How to Verify |
|--------|--------|---|
| Answer quality | Relevant to context | Manual review |
| Token tracking | ±1 tokens | logs |
| Cost calculation | Accurate | verify with API |
| Response time | <5s total | metrics.duration |
| Retry success rate | >95% on transient errors | error logs |
| Error handling | 100% coverage | test results |

---

## 🎯 What Phase 2e Delivers

✅ **Complete RAG System**: PDF → Context → Answer
✅ **LLM Integration**: Groq API with multiple models
✅ **Token Tracking**: Monitor usage + costs
✅ **Streaming**: Real-time token delivery
✅ **Retry Logic**: Handles rate limits + transient errors
✅ **Error Handling**: Comprehensive error messages
✅ **Production-Ready**: Enterprise-grade code

---

## 🚀 After Phase 2e: You Have a Complete RAG System!

**Full pipeline working:**
```
User Question
    ↓
[Phase 2a] Extract text from PDF
    ↓
[Phase 2b] Split into chunks
    ↓
[Phase 2c] Create embeddings
    ↓
[Phase 2d] Find relevant chunks
    ↓
[Phase 2e] Generate answer
    ↓
User gets intelligent answer!
```

---

## 🎓 What You'll Learn

### By completing Phase 2e:
✅ External API integration (Groq)
✅ Token management & cost tracking
✅ Retry strategies & exponential backoff
✅ Rate limiting handling
✅ Streaming responses
✅ Error handling at scale
✅ Complete RAG system architecture

---

## 📈 Cost Tracking Example

For a typical RAG query:
- Input tokens: 342 (context + question)
- Output tokens: 87 (answer)
- Cost: $0.000302 (~0.0003 cents)

**Monthly estimate** (assuming 1000 queries):
- Input: ~342k tokens × $0.0005 = $0.17
- Output: ~87k tokens × $0.0015 = $0.13
- **Total: ~$0.30/month** ✅ (extremely cheap!)

---

This is your complete Phase 2e implementation guide!

**Ready to add intelligence to your RAG system? 🚀**

const llmService = require('./llm.service');
const groqClient = require('../utils/groq.client');
const { ServiceError } = require('../utils/errors');
const axios = require('axios');

jest.mock('axios');

describe('LLM Service Suite', () => {
  let mockAxiosInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockAxiosInstance = {
      post: jest.fn(),
      defaults: { headers: {} }
    };
    
    axios.create.mockReturnValue(mockAxiosInstance);
    groqClient.client = mockAxiosInstance;
    groqClient.maxRetries = 3;
  });

  describe('GroqClient', () => {
    it('should handle successful API calls', async () => {
      const mockResponse = { data: { choices: [{ message: { content: 'Test answer' } }] } };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await groqClient.chatCompletion({ model: 'llama-3-70b-8192' });
      expect(result.choices[0].message.content).toBe('Test answer');
    });

    it('should retry on 429 errors', async () => {
      mockAxiosInstance.post
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValueOnce({ data: { choices: [{ message: { content: 'Success' } }] } });

      const result = await groqClient.chatCompletion({ model: 'llama-3-70b-8192' });
      expect(result.choices[0].message.content).toBe('Success');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('LLMService Core', () => {
    it('should generate an answer with correct payload', async () => {
      const mockResponse = { data: { 
        choices: [{ message: { content: 'RAG Answer' } }],
        usage: { total_tokens: 50 }
      } };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await llmService.generateAnswer('System context', 'User question');
      
      expect(result.answer).toBe('RAG Answer');
      expect(result.tokens).toBe(50);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'System context' },
            { role: 'user', content: 'User question' }
          ]
        })
      );
    });

    it('should calculate cost based on config settings', async () => {
      const mockResponse = { data: { 
        choices: [{ message: { content: 'RAG Answer' } }],
        usage: { total_tokens: 2000 }
      } };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await llmService.generateAnswer('System context', 'User question', {
        model: 'llama-3-70b-8192'
      });
      
      // Llama 3 70B cost is 0.0007 per 1k. 2000 tokens = 2 * 0.0007 = 0.0014
      expect(result.cost).toBeCloseTo(0.0014);
    });

    it('should validate model configurations and throw ServiceError', async () => {
      await expect(
        llmService.generateAnswer('System', 'User', { model: 'invalid-model' })
      ).rejects.toThrow(ServiceError);

      await expect(
        llmService.generateAnswer('System', 'User', { temperature: 3.5 })
      ).rejects.toThrow(ServiceError);
    });

    it('should propagate API failures as ServiceError', async () => {
      groqClient.maxRetries = 1;
      mockAxiosInstance.post.mockRejectedValue({ response: { status: 500, data: { error: { message: 'Internal Server Error' } } } });

      await expect(
        llmService.generateAnswer('System', 'User')
      ).rejects.toThrow(ServiceError);
    });
  });

  describe('LLMService Streaming', () => {
    it('should yield stream chunks correctly', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('data: {"choices":[{"delta":{"content":"Hello "}}]}\n');
          yield Buffer.from('data: {"choices":[{"delta":{"content":"world!"}}]}\n');
          yield Buffer.from('data: [DONE]\n');
        }
      };
      mockAxiosInstance.post.mockResolvedValue({ data: mockStream });

      const generator = llmService.generateAnswerStream('System instructions', 'Question');
      const tokens = [];
      for await (const token of generator) {
        tokens.push(token);
      }

      expect(tokens).toEqual(['Hello ', 'world!']);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          stream: true
        }),
        expect.objectContaining({
          responseType: 'stream'
        })
      );
    });
  });
});

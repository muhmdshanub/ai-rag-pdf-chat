const llmService = require('./llm.service');
const groqClient = require('../utils/groq.client');
const axios = require('axios');

jest.mock('axios');

describe('LLM Integration', () => {
  let mockAxiosInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a mock axios instance
    mockAxiosInstance = {
      post: jest.fn(),
      defaults: { headers: {} }
    };
    
    // Mock axios.create to return this instance
    axios.create.mockReturnValue(mockAxiosInstance);
    
    // Re-initialize groqClient because it's a singleton and might have been created with a real axios
    // or a previous mock. Actually, we should probably just set groqClient.client directly.
    groqClient.client = mockAxiosInstance;
  });

  describe('GroqClient', () => {
    it('should handle successful API calls', async () => {
      const mockResponse = { data: { choices: [{ message: { content: 'Test answer' } }] } };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await groqClient.chatCompletion({ model: 'test' });
      expect(result.choices[0].message.content).toBe('Test answer');
    });

    it('should retry on 429 errors', async () => {
      mockAxiosInstance.post
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValueOnce({ data: { choices: [{ message: { content: 'Success' } }] } });

      const result = await groqClient.chatCompletion({ model: 'test' });
      expect(result.choices[0].message.content).toBe('Success');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('LLMService', () => {
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
  });
});

/**
 * EmbeddingService Tests
 */

const EmbeddingService = require('./embedding.service');
const hfClient = require('../utils/huggingface.client');
const { ServiceError } = require('../utils/errors');

jest.mock('../utils/huggingface.client');

describe('EmbeddingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockValidEmbedding = Array(384).fill(0.1);

  describe('getEmbedding()', () => {
    it('should return embedding for valid text', async () => {
      hfClient.post.mockResolvedValueOnce(mockValidEmbedding);
      
      const result = await EmbeddingService.getEmbedding('Hello world');
      
      expect(result).toHaveLength(384);
      expect(hfClient.post).toHaveBeenCalledTimes(1);
      expect(hfClient.post).toHaveBeenCalledWith(EmbeddingService.apiUrl, { inputs: 'Hello world' });
    });

    it('should throw if the returned embedding dimension is wrong', async () => {
      hfClient.post.mockResolvedValueOnce([0.1, 0.2]); // Only 2 dimensions
      
      await expect(EmbeddingService.getEmbedding('Wrong dims')).rejects.toThrow(/Invalid embedding dimension/);
    });

    it('should bubble up ServiceError from client', async () => {
      hfClient.post.mockRejectedValueOnce(new ServiceError('HuggingFaceClient', 'API Error', 'API_ERROR'));
      
      await expect(EmbeddingService.getEmbedding('Fail')).rejects.toThrow(ServiceError);
    });
  });

  describe('getEmbeddings()', () => {
    it('should batch process texts', async () => {
      const texts = Array(35).fill('test text'); // More than 1 batch (32)
      
      hfClient.post
        .mockResolvedValueOnce(Array(32).fill(mockValidEmbedding))
        .mockResolvedValueOnce(Array(3).fill(mockValidEmbedding));

      const result = await EmbeddingService.getEmbeddings(texts);
      
      expect(result).toHaveLength(35);
      expect(hfClient.post).toHaveBeenCalledTimes(2); // Two batches
    });

    it('should throw if input is not an array', async () => {
      await expect(EmbeddingService.getEmbeddings('not an array')).rejects.toThrow(ServiceError);
    });
  });
});

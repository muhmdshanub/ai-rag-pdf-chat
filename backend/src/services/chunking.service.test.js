/**
 * ChunkingService Tests
 *
 * Tests the chunking algorithm for:
 * - Correct chunk creation
 * - Proper overlap
 * - Sentence boundary preservation
 * - Edge cases (empty text, tiny chunks, etc.)
 */

const ChunkingService = require('./chunking.service');
const { ServiceError } = require('../utils/errors');

describe('ChunkingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('chunk()', () => {
    it('should chunk text into appropriate sizes', async () => {
      const text = 'This is sentence one. This is sentence two. This is sentence three.';
      const result = await ChunkingService.chunk(text, {
        chunkSize: 50,
        overlapSize: 10,
        minChunkSize: 10
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('text');
      expect(result[0]).toHaveProperty('index');
      expect(result[0]).toHaveProperty('position');
      expect(result[0]).toHaveProperty('statistics');
    });

    it('should maintain overlap between chunks', async () => {
      const text = 'A. B. C. D. E. F. G. H. I. J. K. L. M. N. O. P. Q. R. S. T.';
      const result = await ChunkingService.chunk(text, {
        chunkSize: 30,
        overlapSize: 10,
        minChunkSize: 10
      });

      expect(result.length).toBeGreaterThan(1);

      for (let i = 0; i < result.length - 1; i++) {
        const currentChunk = result[i].text;
        const nextChunk = result[i + 1].text;
        
        // Last 10 chars of current chunk should appear in next chunk (approx)
        const overlapPart = currentChunk.slice(-10).trim();
        expect(nextChunk).toContain(overlapPart);
      }
    });

    it('should preserve sentence boundaries', async () => {
      const text = 'First sentence. Second sentence. Third sentence.';
      const result = await ChunkingService.chunk(text, {
        chunkSize: 100,
        overlapSize: 10,
        minChunkSize: 10
      });

      result.forEach(chunk => {
        // Should end with punctuation (approximate check)
        expect(chunk.text).toMatch(/[.!?]$/);
      });
    });

    it('should throw ServiceError for invalid text', async () => {
      await expect(ChunkingService.chunk(null)).rejects.toThrow(ServiceError);
      await expect(ChunkingService.chunk('')).rejects.toThrow(ServiceError);
      await expect(ChunkingService.chunk(123)).rejects.toThrow(ServiceError);
    });

    it('should throw ServiceError for invalid parameters', async () => {
      const text = 'Valid text.';
      await expect(ChunkingService.chunk(text, { chunkSize: 0 })).rejects.toThrow(ServiceError);
      await expect(ChunkingService.chunk(text, { overlapSize: 100, chunkSize: 50 })).rejects.toThrow(ServiceError);
      await expect(ChunkingService.chunk(text, { minChunkSize: -5 })).rejects.toThrow(ServiceError);
    });
  });

  describe('calculateOptimalChunkSize()', () => {
    it('should calculate size based on document type and length', () => {
      expect(ChunkingService.calculateOptimalChunkSize(1000, 'academic')).toBe(500);
      expect(ChunkingService.calculateOptimalChunkSize(10000, 'general')).toBe(400);
      expect(ChunkingService.calculateOptimalChunkSize(100000, 'technical')).toBe(600);
      expect(ChunkingService.calculateOptimalChunkSize(300000, 'general')).toBe(600);
    });
  });

  describe('getChunkingStatistics()', () => {
    it('should calculate statistics correctly for valid chunks', () => {
      const chunks = [
        { text: 'This is the first chunk.' },
        { text: 'And this is the second chunk.' }
      ];
      
      const stats = ChunkingService.getChunkingStatistics(chunks);
      expect(stats.totalChunks).toBe(2);
      expect(stats.totalCharacters).toBe(53); // 24 + 29
      expect(stats.totalWords).toBe(11);      // 5 + 6
      expect(stats.minChunkSize).toBe(24);
      expect(stats.maxChunkSize).toBe(29);
      expect(stats.averageChunkSize).toBe(27); // 53 / 2
    });

    it('should handle empty chunks array', () => {
      const stats = ChunkingService.getChunkingStatistics([]);
      expect(stats.totalChunks).toBe(0);
      expect(stats.totalCharacters).toBe(0);
    });
  });
});

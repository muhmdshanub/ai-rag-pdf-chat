const ragService = require('./rag.service');

describe('RAGService', () => {
  describe('refineContext()', () => {
    it('should filter by hard threshold', () => {
      const chunks = [
        { similarity: '0.9', content: 'Good' },
        { similarity: '0.1', content: 'Bad' }
      ];
      const refined = ragService.refineContext(chunks, { minSimilarity: 0.4 });
      expect(refined).toHaveLength(1);
      expect(refined[0].content).toBe('Good');
    });

    it('should stop at the "elbow" (relevance gap)', () => {
      const chunks = [
        { similarity: '0.95', content: 'A' },
        { similarity: '0.92', content: 'B' },
        { similarity: '0.60', content: 'C' }, // Gap > 0.15
        { similarity: '0.58', content: 'D' }
      ];
      const refined = ragService.refineContext(chunks, { minSimilarity: 0.3 });
      expect(refined).toHaveLength(2);
      expect(refined[0].content).toBe('A');
      expect(refined[1].content).toBe('B');
    });

    it('should respect the character budget', () => {
      const chunks = [
        { similarity: '0.9', content: 'A'.repeat(500) },
        { similarity: '0.8', content: 'B'.repeat(500) }
      ];
      // Limit to 600 chars (500 + overhead)
      const refined = ragService.refineContext(chunks, { maxContextLength: 600 });
      expect(refined).toHaveLength(1);
      expect(refined[0].content).toBe('A'.repeat(500));
    });
  });

  describe('filterChunks()', () => {
    it('should filter out chunks below the minimum similarity threshold', () => {
      const chunks = [
        { id: 1, similarity: '0.85', content: 'High' },
        { id: 2, similarity: '0.35', content: 'Medium' },
        { id: 3, similarity: '0.20', content: 'Low' },
      ];

      const filtered = ragService.filterChunks(chunks, 0.3);
      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe(1);
      expect(filtered[1].id).toBe(2);
    });

    it('should return an empty array if no chunks are provided', () => {
      expect(ragService.filterChunks(null)).toEqual([]);
      expect(ragService.filterChunks([])).toEqual([]);
    });
  });

  describe('buildContext()', () => {
    it('should correctly format a single chunk', () => {
      const chunks = [
        { chunk_index: 0, similarity: '0.85123', content: 'Hello World' }
      ];
      const context = ragService.buildContext(chunks);
      expect(context).toContain('[Chunk 0 | Similarity: 0.85]:');
      expect(context).toContain('Hello World');
    });

    it('should concatenate multiple chunks with a separator', () => {
      const chunks = [
        { chunk_index: 0, similarity: '0.9', content: 'First' },
        { chunk_index: 1, similarity: '0.8', content: 'Second' }
      ];
      const context = ragService.buildContext(chunks);
      expect(context).toContain('First');
      expect(context).toContain('Second');
      expect(context).toContain('─'.repeat(80)); // Separator
    });

    it('should truncate context if it exceeds max length', () => {
      const chunks = [
        { chunk_index: 0, similarity: '0.9', content: 'A'.repeat(2000) },
        { chunk_index: 1, similarity: '0.8', content: 'B'.repeat(1500) }
      ];
      // Max length is 3000 by default. Second chunk will be dropped.
      const context = ragService.buildContext(chunks, 3000);
      expect(context).toContain('A'.repeat(2000));
      expect(context).not.toContain('B'.repeat(1500));
    });

    it('should return empty string for no chunks', () => {
      expect(ragService.buildContext([])).toBe('');
    });
  });

  describe('buildPrompt()', () => {
    it('should build a prompt with context', () => {
      const { system, user } = ragService.buildPrompt('What is X?', 'Context about X');
      expect(system).toContain('You are a helpful AI assistant');
      expect(user).toContain('Context from document:');
      expect(user).toContain('Context about X');
      expect(user).toContain('Question: What is X?');
    });

    it('should build a prompt without context if none provided', () => {
      const { system, user } = ragService.buildPrompt('What is X?', '');
      expect(system).toBeDefined();
      expect(user).toContain('Question: What is X?');
      expect(user).toContain('Note: No relevant context found');
    });

    it('should throw if query is invalid', () => {
      expect(() => ragService.buildPrompt(null, 'context')).toThrow('Query must be a valid string');
    });
  });
});

jest.mock('../registry', () => {
  return {
    documentRepository: {
      findReadyForChat: jest.fn()
    },
    embedding: {
      getEmbeddings: jest.fn()
    },
    cache: {
      generateStringKey: jest.fn(),
      get: jest.fn(),
      set: jest.fn()
    },
    chunkRepository: {
      findSimilar: jest.fn()
    },
    rag: {
      refineContext: jest.fn(),
      buildContext: jest.fn(),
      buildPrompt: jest.fn()
    },
    llm: {
      generateAnswer: jest.fn(),
      generateAnswerStream: jest.fn()
    },
    chatMessageRepository: {
      create: jest.fn()
    }
  };
});

const chatPipeline = require('./chat.pipeline');
const registry = require('../registry');
const { NotFoundError } = require('../utils/errors');

describe('ChatPipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ask', () => {
    it('should throw NotFoundError if document is not ready', async () => {
      registry.documentRepository.findReadyForChat.mockResolvedValue(null);

      await expect(
        chatPipeline.ask(1, 'Test query')
      ).rejects.toThrow(NotFoundError);
    });

    it('should successfully run regular chat RAG flow', async () => {
      registry.documentRepository.findReadyForChat.mockResolvedValue({ id: 1, name: 'doc.pdf' });
      registry.cache.generateStringKey.mockReturnValue('cache-key');
      registry.cache.get.mockResolvedValue(null); // cache miss
      registry.embedding.getEmbeddings.mockResolvedValue([[0.1, 0.2]]);
      
      const mockChunks = [
        { id: 10, content: 'Chunk A content', similarity: 0.8, chunk_index: 1 }
      ];
      registry.chunkRepository.findSimilar.mockResolvedValue(mockChunks);
      registry.rag.refineContext.mockReturnValue(mockChunks);
      registry.rag.buildContext.mockReturnValue('Formatted context');
      registry.rag.buildPrompt.mockReturnValue({ system: 'Sys prompt', user: 'User prompt' });
      
      registry.llm.generateAnswer.mockResolvedValue({
        answer: 'Final RAG Answer',
        tokens: 150,
        model: 'llama-3-70b-8192',
        durationMs: 300,
        cost: 0.0001
      });

      const result = await chatPipeline.ask(1, 'Test query');

      expect(result.answer).toBe('Final RAG Answer');
      expect(result.chunks).toBe(1);
      expect(result.tokensUsed).toBe(150);
      expect(registry.chatMessageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: 1,
          userMessage: 'Test query',
          aiResponse: 'Final RAG Answer',
          retrievedChunkIds: [10],
          tokensUsed: 150
        })
      );
    });
  });

  describe('askStream', () => {
    it('should throw NotFoundError if document is not ready in stream', async () => {
      registry.documentRepository.findReadyForChat.mockResolvedValue(null);

      const generator = chatPipeline.askStream(1, 'Test query');
      await expect(generator.next()).rejects.toThrow(NotFoundError);
    });

    it('should successfully run streaming chat RAG flow and save message at the end', async () => {
      registry.documentRepository.findReadyForChat.mockResolvedValue({ id: 1, name: 'doc.pdf' });
      registry.cache.generateStringKey.mockReturnValue('cache-key');
      registry.cache.get.mockResolvedValue([0.1, 0.2]); // cache hit
      
      const mockChunks = [
        { id: 12, content: 'Chunk B content', similarity: 0.85, chunk_index: 2 }
      ];
      registry.chunkRepository.findSimilar.mockResolvedValue(mockChunks);
      registry.rag.refineContext.mockReturnValue(mockChunks);
      registry.rag.buildContext.mockReturnValue('Formatted context');
      registry.rag.buildPrompt.mockReturnValue({ system: 'Sys prompt', user: 'User prompt' });

      // Mock LLM streaming generator
      async function* mockLlmStream() {
        yield 'Hello ';
        yield 'world!';
      }
      registry.llm.generateAnswerStream.mockReturnValue(mockLlmStream());

      const generator = chatPipeline.askStream(1, 'Test query');
      
      // First yield should be metadata
      const first = await generator.next();
      expect(first.value).toEqual({
        event: 'metadata',
        data: {
          chunks: [{ chunkIndex: 2, similarity: 0.85 }]
        }
      });

      // Subsequent yields should be tokens
      const second = await generator.next();
      expect(second.value).toEqual({
        event: 'token',
        data: 'Hello '
      });

      const third = await generator.next();
      expect(third.value).toEqual({
        event: 'token',
        data: 'world!'
      });

      // Stream should close
      const fourth = await generator.next();
      expect(fourth.done).toBe(true);

      // Verify conversation save at the end
      expect(registry.chatMessageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: 1,
          userMessage: 'Test query',
          aiResponse: 'Hello world!',
          retrievedChunkIds: [12]
        })
      );
    });
  });
});

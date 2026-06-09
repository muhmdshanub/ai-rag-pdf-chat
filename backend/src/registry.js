/**
 * Service Registry
 *
 * Central place to instantiate and wire all services and models.
 * Every consumer imports from here instead of directly requiring service files.
 *
 * Benefits:
 *  - One file to see all dependencies at a glance
 *  - Easy to swap implementations (e.g. mock storage for tests)
 *  - Services are still singletons (created once, reused everywhere)
 *  - No external libraries needed
 *
 * Usage in controllers / jobs:
 *   const { pdfParser, storage } = require('../registry');
 */

const PDFParserService = require('./services/pdf-parser.service');
const StorageService = require('./services/storage.service');
const CacheService = require('./services/cache.service');
const ChunkingService = require('./services/chunking.service');
const EmbeddingService = require('./services/embedding.service');
const RAGService = require('./services/rag.service');
const LLMService = require('./services/llm.service');
const QueryRewriterService = require('./services/query-rewriter.service');
const RerankerService = require('./services/reranker.service');

const DocumentPipeline = require('./pipelines/document.pipeline');
const ChatPipeline = require('./pipelines/chat.pipeline');

const DocumentRepository = require('./repositories/document.repository');
const ChunkRepository = require('./repositories/chunk.repository');
const ChatMessageRepository = require('./repositories/chat-message.repository');

// ─── Service Instances ──────────────────────────────────────────────
// Each service file now exports its CLASS (not an instance).
// We instantiate them here so there's exactly one place that
// controls construction order, config injection, and lifecycle.

const registry = {
  // Services
  pdfParser: PDFParserService,
  storage: StorageService,
  cache: CacheService,
  chunking: ChunkingService,
  embedding: EmbeddingService,
  rag: RAGService,
  llm: LLMService,
  queryRewriter: QueryRewriterService,
  reranker: RerankerService,

  // Repositories
  documentRepository: DocumentRepository,
  chunkRepository: ChunkRepository,
  chatMessageRepository: ChatMessageRepository,

  // Pipelines
  documentPipeline: DocumentPipeline,
  chatPipeline: ChatPipeline,
};

module.exports = registry;

# Architecture Quick Reference

## 🏗️ 8-Layer Stack Cheat Sheet

```
Layer 1: PRESENTATION      → React + Vite + Tailwind (User sees this)
Layer 2: API GATEWAY       → Express.js (HTTP router & middleware)
Layer 3: CONTROLLERS       → Business logic orchestration
Layer 4: AI SERVICES       → PDF Parse, Chunk, Embed, RAG, LLM
Layer 5: THIRD-PARTY       → Groq, HuggingFace (External APIs)
Layer 6: DATA STORAGE      → PostgreSQL + pgvector, File storage
Layer 7: CACHE/QUEUE       → Redis, Bull (Speed & async jobs)
Layer 8: DEPLOYMENT        → Docker, Railway, Monitoring
```

---

## 📡 Service Communication Map

```
FRONTEND
  ↓
  POST /api/upload         → uploadController → uploadQueue → DB
  POST /api/chat           → chatController → RAG → LLM → DB
  GET /api/documents       → documentController → DB
  DELETE /api/documents/:id → documentController → DB
```

---

## 🔄 Core Processes

### Upload Flow
```
Upload PDF
  ↓
Save to disk → Create DB record → Queue job → Return immediately
  ↓
[Background] Extract → Chunk → Embed → Store → Mark complete
```

### Chat Flow
```
User question
  ↓
Embed question → Find similar chunks → Build context → Call LLM → Return answer
  ↓
Save to chat history
```

---

## 🗄️ Database Schema (Simplified)

```
documents
├─ id (PK)
├─ filename
├─ status: 'processing' | 'completed' | 'failed'
└─ total_chunks

chunks (90k rows for large docs)
├─ id (PK)
├─ document_id (FK) → documents
├─ chunk_index
├─ text
├─ embedding: vector(384)  ← pgvector for similarity search
└─ INDEX: ivfflat on embedding (fast nearest neighbor)

chat_messages
├─ id (PK)
├─ document_id (FK)
├─ user_message
├─ ai_response
├─ retrieved_chunks: int[] (which chunks used)
└─ tokens_used (for tracking cost)
```

---

## 🚀 Technology Matrix

| Component | Technology | Why This? | Alternative |
|-----------|-----------|----------|------------|
| Frontend Framework | React | You know it | Vue, Svelte |
| Build Tool | Vite | Fast, modern | Webpack, Esbuild |
| CSS | Tailwind | Utility-first | CSS Modules, Styled |
| HTTP Client | Axios | Simple, works | Fetch, TanStack Query |
| Backend | Express.js | Minimal, familiar | Nest.js, Fastify |
| Database | PostgreSQL | Relational + pgvector | MySQL, SQLite |
| Vector Search | pgvector | Already in Postgres | Pinecone, Weaviate |
| Caching | Redis | Fast, reliable | Memcached |
| Job Queue | Bull | Node.js native | BullMQ, RQ |
| LLM API | Groq | Fast, free tier | OpenAI, Claude |
| Embeddings | HuggingFace | Free, open-source | OpenAI, Cohere |
| Deployment | Railway | Easiest for beginners | Render, Heroku, AWS |
| Monitoring | Winston | Lightweight logging | Sentry, DataDog |

---

## 🔐 Secrets Management

```env
.env (git-ignored, local development)
├─ DATABASE_URL=postgresql://dev:dev123@localhost:5432/rag_chat
├─ REDIS_URL=redis://localhost:6379
├─ GROQ_API_KEY=gsk_xxxxx
└─ HUGGINGFACE_API_KEY=hf_xxxxx

Production (Railway Dashboard)
├─ DATABASE_URL=postgresql://user:pass@db.railway.app/rag
├─ REDIS_URL=redis://cache.railway.app:6379
├─ GROQ_API_KEY=gsk_xxxxx
└─ HUGGINGFACE_API_KEY=hf_xxxxx
```

---

## 📊 Data Flow Summary

### Synchronous (Fast)
```
Request → Controller → Service → External API → Database → Response
Latency: ~500ms - 2 sec
```

### Asynchronous (Background)
```
Upload → Queue → Worker (background) → Process → Store → Notify
Latency: 2-10 sec (non-blocking)
```

---

## 🎯 Key Design Principles

| Principle | Implementation | Benefit |
|-----------|---|---|
| **Separation of Concerns** | Controllers → Services → DB | Easy to test, modify |
| **Async Processing** | Bull Queue for PDF processing | Non-blocking uploads |
| **Caching** | Redis for embeddings & session | 10x faster responses |
| **Vector Search** | pgvector with IVFFLAT index | Semantic similarity search |
| **Error Handling** | Try-catch + retry logic | Resilient to API failures |
| **Monitoring** | Winston logging + metrics | Debug issues in production |

---

## 🔍 Request Lifecycle (ChatFlow Example)

```
T=0ms     Client: POST /api/chat
          { documentId: 5, message: "How does RAG work?" }

T=5ms     Express receives, validates, routes

T=10ms    chatController.chat() starts

T=50ms    embeddingService.getEmbedding()
          - Check Redis cache ❌ (miss)
          - Call HuggingFace API ✓

T=200ms   HuggingFace returns embedding vector

T=250ms   ragService.retrieveChunks()
          - pgvector similarity search with index

T=300ms   PostgreSQL returns 5 most similar chunks

T=350ms   ragService.buildContext()
          - Concatenate chunks into context string

T=360ms   llmService.generateAnswer()
          - Call Groq API with context + question

T=800ms   Groq returns generated answer

T=850ms   Save to chat_messages table

T=900ms   Return to client:
          {
            answer: "RAG combines retrieval and generation...",
            retrievedChunks: 5,
            tokensUsed: 342
          }

TOTAL LATENCY: ~900ms (mostly waiting for external APIs)
```

---

## 💾 Storage Architecture

```
Files
└── ./uploads/
    ├── 1704067200000-kubernetes.pdf (16MB)
    ├── 1704067300000-react-guide.pdf (8MB)
    └── (Future: Move to S3 for scale)

Database
└── PostgreSQL (30GB instance)
    ├── documents: 100 rows (~1KB each)
    ├── chunks: 100,000 rows (~2KB each = 200GB if stored here)
    ├── chat_messages: 10,000 rows (~1KB each)
    └── indexes: IVFFLAT for embedding vectors

Cache
└── Redis (2GB)
    ├── Embedding cache (keep last 1000)
    ├── Session data
    └── Bull job queue state
```

---

## 🔌 API Rate Limiting (Future)

```
Groq API:      30 req/min (free tier)
                → Implement queue + backoff
                → Cache responses in Redis

HuggingFace:   Unlimited for inference API
                → But batching is more efficient

Your Backend:  Add rate limiting per user (future)
                → Use Redis for tracking
                → Return 429 Too Many Requests
```

---

## 📈 Scaling Path

### MVP (Current - 1-5 users)
```
Single Express server
Single PostgreSQL
Single Redis
Sufficient for learning
```

### Small (5-100 users)
```
Same stack, optimize queries
Add connection pooling
Monitor slow queries
Cache more aggressively
```

### Medium (100-1K users)
```
Load balancer in front of Express
Database read replicas
Dedicated caching layer
S3 for file storage
Separate vector DB (Pinecone)
```

### Large (1K-10K+ users)
```
Horizontal scaling (K8s)
Managed PostgreSQL (AWS RDS)
Managed Redis (AWS ElastiCache)
CDN for frontend
Dedicated ML inference cluster
Multi-region replication
```

---

## 🧪 Testing Strategy

```
Unit Tests (Services)
├─ PDFParser.extractText()
├─ ChunkingService.chunk()
├─ EmbeddingService.getEmbedding()
└─ RAGService.retrieveChunks()

Integration Tests (Controllers + Services)
├─ Upload workflow
├─ Chat workflow
└─ Document deletion

E2E Tests (Full flow)
├─ User uploads PDF
├─ User asks questions
├─ Verifies answers are relevant
└─ Cleanup

Load Tests
├─ 100 concurrent uploads
├─ 1000 concurrent chat requests
└─ Identify bottlenecks
```

---

## 🚨 Monitoring Checklist

### Logs to Track
- API request duration
- LLM token usage (cost tracking)
- Database query time
- Embedding API latency
- Error rates

### Alerts to Set
- LLM API down (>5 failures/min)
- Database connection pool exhausted
- Redis out of memory
- PDF processing timeout (>2 min)
- Unusual token usage spike

### Metrics Dashboard
- Requests/sec
- Average response time
- Cache hit rate
- Queue depth (Bull jobs)
- Error rate by endpoint

---

## 🎓 Learning Roadmap

**Week 1-2:** Build current stack
- ✅ Database schema
- ✅ Express API
- ✅ React frontend
- ✅ RAG flow

**Week 3-4:** Add features
- Chunk reranking (improve relevance)
- Hybrid search (semantic + keyword)
- User authentication
- Multi-document chat

**Week 5-6:** Scale & optimize
- Caching layer deep dive
- Database indexing optimization
- Load testing
- Deployment to production

**Week 7-8:** Explore advanced
- Custom embedding models
- Fine-tuned LLMs
- Agentic workflows
- Multi-turn conversations

---

## 📚 Quick Command Reference

```bash
# Local Development
npm run dev              # Start backend + watch
docker-compose up -d    # Start Postgres + Redis
npm run init-db        # Create tables

# Build & Deploy
npm run build          # Compile for production
docker build -t app .  # Create Docker image
git push               # Push to Railway (auto-deploy)

# Debugging
npm run logs           # View server logs
docker logs postgres   # View DB logs
redis-cli              # Connect to Redis directly
SELECT * FROM chunks;  # Query chunks in psql
```

---

## 🎯 Success Metrics

- ✅ User can upload PDF in <2 sec
- ✅ PDF processes to vectors in <30 sec
- ✅ Chat question answered in <1 sec
- ✅ Answer uses relevant chunks from document
- ✅ System handles 10 concurrent users without errors
- ✅ All data persists after server restart
- ✅ Cost per chat < $0.01 (token usage)

---

**Next Action:** Review the INFRASTRUCTURE_DESIGN.md and DATA_FLOW_DIAGRAMS.md files to understand how each piece fits together.

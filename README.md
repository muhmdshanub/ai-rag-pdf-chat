# 🤖 AI RAG PDF Chat

An enterprise-grade **Retrieval-Augmented Generation (RAG)** application that lets you upload any PDF and have an intelligent, source-cited conversation with it — powered by a production-quality RAG pipeline implementing **15+ industry best practices**.

---

## ✨ Features

- 📄 **Upload any PDF** — narrative docs, resumes, technical manuals, research papers
- 💬 **Intelligent Q&A** — powered by Groq LLM (Llama 3.3 70B)
- 🔍 **Hybrid Search** — Vector (semantic) + Full Text Search (keyword) combined
- 🔁 **Streaming responses** — tokens stream to the UI in real time
- 📌 **Source citations** — every fact is annotated with `[1]`, `[2]` references
- 🧠 **Query Rewriting** — LLM extracts critical keywords before FTS to eliminate noise
- 🎯 **MMR Diversification** — deduplicates near-identical chunks before sending to LLM
- 🚫 **Hallucination prevention** — LLM says "I don't know" instead of making things up
- ⚡ **Redis caching** — query embeddings and PDF extraction cached for speed
- 🔄 **Background processing** — upload returns instantly; chunking/embedding runs async

---

## 🏗️ Architecture — 8-Layer Stack

```
Layer 1: React Frontend        → Chat UI, upload, document list, streaming
Layer 2: Express.js API        → HTTP routing, validation, error handling
Layer 3: Pipelines             → chat.pipeline.js, document.pipeline.js
Layer 4: AI Services           → QueryRewriter, Embedding, RAG, LLM, Reranker, Chunking
Layer 5: External AI APIs      → Groq (LLM), HuggingFace (Embeddings)
Layer 6: PostgreSQL + pgvector → Documents, Chunks (vectors + FTS), Chat history
Layer 7: Redis + BullMQ        → Embedding cache, PDF extraction cache, job queue
Layer 8: Docker                → Containerized local dev, production-ready
```

---

## 🧠 RAG Pipeline — Best Practices Implemented

This project implements **15 out of 31** industry-standard RAG best practices:

### Ingestion (Upload Time)
| Practice | Status | Implementation |
|---|---|---|
| Sentence-aware Chunking | ✅ | `chunking.service.js` — splits on sentence boundaries |
| Chunk Overlap | ✅ | 200-char overlap (25% ratio) prevents mid-sentence cuts |
| Configurable chunk size | ✅ | `CHUNKING_CHUNK_SIZE` env var (default 800 chars) |
| Embedding caching | ✅ | Redis 24h TTL, per-chunk cache |
| PDF extraction caching | ✅ | Redis 1h TTL, file-hash based key |
| Background processing | ✅ | BullMQ job queue, 3 auto-retries with exponential backoff |

### Retrieval (Chat Time)
| Practice | Status | Implementation |
|---|---|---|
| Vector Search | ✅ | pgvector cosine distance, `embedding <=> query` |
| Full Text Search (FTS) | ✅ | PostgreSQL `tsvector` / `tsquery`, GIN index |
| Hybrid Search | ✅ | Vector + FTS merged with Synthetic Scoring in SQL |
| Query Rewriting | ✅ | `query-rewriter.service.js` — LLM extracts FTS keywords, 2s timeout + fallback |
| Relevance Filtering | ✅ | `minSimilarity` hard threshold (default 0.25) |
| Gap Detection (Elbow Logic) | ✅ | `gapThreshold` dynamically cuts irrelevant tail chunks |
| Token Budgeting | ✅ | `maxContextChars` hard stop before context overflow |
| MMR Deduplication | ✅ | `applyMMR()` — λ=0.7 relevance/diversity balance |
| Cross-Encoder Re-ranking | ⚙️ | `reranker.service.js` — disabled by default (`RAG_RERANKER_ENABLED=true`) |

### Generation (LLM Time)
| Practice | Status | Implementation |
|---|---|---|
| Source Citations | ✅ | `[1]`, `[2]` appended inline per fact |
| Negative Handling | ✅ | System prompt enforces "I don't know" over hallucination |
| Streaming | ✅ | SSE token-by-token streaming via `generateAnswerStream()` |
| Low Temperature | ✅ | `temperature: 0.1` for factual, deterministic answers |
| System Prompt Engineering | ✅ | Strict factual-only prompt with anti-hallucination rules |

---

## 🔄 Chat Pipeline Flow

```
User Question
    │
    ▼
Step 1:   Verify document exists (ready for chat)
    │
    ▼
Step 2:   Embed query → Redis cache (24h TTL) → HuggingFace API
    │
    ▼
Step 2.5: Query Rewriting → extract FTS keywords via LLM (2s timeout + fallback)
    │
    ▼
Step 3:   Hybrid Search → Vector (cosine similarity) + FTS (keywords)
          SQL UNION with Synthetic Scoring → MAX(similarity) deduplication
    │
    ▼
Step 3.5: Cross-Encoder Re-ranking [optional, RAG_RERANKER_ENABLED=true]
    │
    ▼
Step 4:   refineContext() → minSimilarity filter → Gap Detection → Token Budget
    │
    ▼
Step 4.5: MMR Diversification → applyMMR(λ=0.7)
    │
    ▼
Step 5:   buildContext() → format chunks with [N] source IDs
    │
    ▼
Step 6:   buildPrompt() → LLM → Streaming or Complete answer
    │
    ▼
Step 7:   Save to chat_messages table (with retrieved_chunk_ids)
```

---

## 🗄️ Database Schema

### `documents`
| Column | Type | Description |
|---|---|---|
| id | SERIAL PK | |
| filename | VARCHAR(255) | stored filename |
| original_name | VARCHAR(255) | user's original filename |
| status | VARCHAR(50) | `processing` \| `completed` \| `failed` |
| progress | INTEGER | 0–100% |
| total_chunks | INTEGER | chunk count after processing |

### `chunks`
| Column | Type | Description |
|---|---|---|
| id | SERIAL PK | |
| document_id | INTEGER FK | CASCADE delete |
| chunk_index | INTEGER | position in document |
| content | TEXT | chunk text |
| embedding | vector(384) | pgvector 384-dim HuggingFace embedding |
| fts_vector | tsvector | auto-generated FTS index (GENERATED ALWAYS) |

### `chat_messages`
| Column | Type | Description |
|---|---|---|
| id | SERIAL PK | |
| document_id | INTEGER FK | |
| user_message | TEXT | |
| ai_response | TEXT | |
| retrieved_chunk_ids | INTEGER[] | which chunks were used |
| tokens_used | INTEGER | for cost tracking |
| model_used | VARCHAR | which LLM model |
| response_time_ms | INTEGER | |

---

## 🛠️ Tech Stack

| Component | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JS |
| Backend | Node.js + Express.js |
| LLM | Groq API (llama-3.3-70b-versatile) |
| Embeddings | HuggingFace (sentence-transformers/all-MiniLM-L6-v2, 384-dim) |
| Vector DB | PostgreSQL + pgvector extension |
| Full Text Search | PostgreSQL native tsvector/tsquery |
| Caching | Redis |
| Job Queue | BullMQ |
| Logging | Winston |
| Containerisation | Docker + docker-compose |

---

## ⚙️ Environment Variables

```env
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/rag_chat
REDIS_URL=redis://localhost:6379
HUGGINGFACE_API_KEY=hf_xxxxx

# Optional (have defaults)
GROQ_API_KEY=gsk_xxxxx
PORT=5000
LLM_DEFAULT_MODEL=llama-3.3-70b-versatile
LLM_DEFAULT_TEMPERATURE=0.1
LLM_MAX_TOKENS=1024

# RAG Tuning
RAG_RECALL_K=30
RAG_MIN_SIMILARITY=0.25
RAG_MAX_CONTEXT_CHARS=12000

# Query Rewriting
RAG_QUERY_REWRITER_ENABLED=true
RAG_QUERY_REWRITER_MODEL=llama-3.1-8b-instant
RAG_QUERY_REWRITER_TIMEOUT_MS=2000

# MMR Diversification
RAG_MMR_ENABLED=true
RAG_MMR_LAMBDA=0.7

# Cross-Encoder Re-ranking (off by default — requires HF quota)
RAG_RERANKER_ENABLED=false
RAG_RERANKER_MODEL=cross-encoder/ms-marco-MiniLM-L-6-v2

# Chunking
CHUNKING_CHUNK_SIZE=800
CHUNKING_OVERLAP_SIZE=200
CHUNKING_MIN_CHUNK_SIZE=50
```

---

## 🚀 Getting Started (Local Development)

See the full setup guide: **[docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md)**

**Quick summary:**
1. Install Node.js 18+ and Docker Desktop
2. Create free accounts on [Groq](https://console.groq.com) and [HuggingFace](https://huggingface.co) → get API keys
3. `docker-compose up -d postgres redis` — start the database and cache
4. Create `backend/.env` with your API keys (template in the guide)
5. `cd backend && npm install && npm run db:init` — install and migrate
6. `node run_migration.js` — apply the FTS/hybrid search migration
7. `npm run dev` — start the backend on port 5000
8. Open a new terminal → `cd frontend && npm install && npm run dev` — start the frontend on port 3000
9. Open **http://localhost:3000**

---

## 📂 Project Structure

```
ai-rag-pdf-chat/
├── backend/
│   └── src/
│       ├── config/
│       │   └── index.js              ← All env vars with Joi validation
│       ├── db/
│       │   └── migrations/
│       │       ├── 001_initial_schema.sql
│       │       └── 002_add_fts_hybrid_search.sql  ← FTS tsvector + GIN index
│       ├── pipelines/
│       │   ├── chat.pipeline.js      ← 7-step RAG chat orchestration
│       │   └── document.pipeline.js  ← Upload → chunk → embed → store
│       ├── repositories/
│       │   ├── chunk.repository.js   ← Hybrid search SQL (Vector + FTS UNION)
│       │   ├── document.repository.js
│       │   └── chat-message.repository.js
│       ├── services/
│       │   ├── chunking.service.js        ← Sentence-aware overlapping chunking
│       │   ├── embedding.service.js       ← HuggingFace batch embeddings
│       │   ├── llm.service.js             ← Groq streaming + non-streaming
│       │   ├── query-rewriter.service.js  ← LLM keyword extraction (NEW)
│       │   ├── rag.service.js             ← refineContext + applyMMR (NEW)
│       │   └── reranker.service.js        ← Cross-encoder re-ranking (NEW)
│       ├── registry.js               ← Service singleton registry
│       └── utils/
│           ├── constants.js
│           ├── errors.js
│           └── logger.js
├── frontend/
│   └── index.html                    ← Vanilla HTML/CSS/JS chat UI
├── docs/
│   ├── CAPABILITIES_AND_LIMITATIONS.md  ← What works / what doesn't
│   ├── ARCHITECTURE_SUMMARY.md
│   ├── ARCHITECTURE_CHEAT_SHEET.md
│   ├── DATA_FLOW_DIAGRAMS.md
│   ├── CODING_GUIDELINES.md
│   └── DOCUMENTATION_INDEX.md
├── test_api_flow.js          ← 10-question resume test script
├── test_comprehensive.js     ← Full suite: all question types, both PDFs
├── docker-compose.yml
└── README.md
```

---

## 📊 What the System Can and Cannot Do

See [`docs/CAPABILITIES_AND_LIMITATIONS.md`](docs/CAPABILITIES_AND_LIMITATIONS.md) for the full breakdown. Summary:

### ✅ Works Well
- Direct questions about specific facts ("What is his CGPA?")
- Indirect / semantic questions ("Which in-memory store did he use for caching?")
- Multi-part / clubbed questions ("Describe the architecture including database and messaging layers")
- Technical keyword lookups ("What projects used RabbitMQ?")
- Negative / out-of-scope questions (gracefully says "I don't know")
- Both dense (resume/CV) and narrative (article/report) PDFs

### ❌ Known Limitations
- **Aggregation questions** — "How many companies?" (requires reading multiple unrelated chunks)
- **Cross-document queries** — each chat is scoped to one PDF
- **Arithmetic** — LLM cannot reliably calculate from numbers in the document
- **Table extraction** — PDF table structure is lost during text extraction

---

## 📚 Documentation

| File | Description |
|---|---|
| [LOCAL_SETUP.md](docs/LOCAL_SETUP.md) | ← **Start here to run locally** |
| [CAPABILITIES_AND_LIMITATIONS.md](docs/CAPABILITIES_AND_LIMITATIONS.md) | ← **Read before testing** |
| [HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) | Complete implementation guide |
| [ARCHITECTURE_SUMMARY.md](docs/ARCHITECTURE_SUMMARY.md) | 8-layer system overview |
| [ARCHITECTURE_CHEAT_SHEET.md](docs/ARCHITECTURE_CHEAT_SHEET.md) | Quick reference |
| [DATA_FLOW_DIAGRAMS.md](docs/DATA_FLOW_DIAGRAMS.md) | ASCII flow diagrams |
| [CODING_GUIDELINES.md](docs/CODING_GUIDELINES.md) | Code style and patterns |
| [DOCUMENTATION_INDEX.md](docs/DOCUMENTATION_INDEX.md) | Navigation guide |

---

## 🧪 Running Tests

```bash
# 10-question resume test
node test_api_flow.js

# Full comprehensive test (all question types, both PDFs)
node test_comprehensive.js
```

---

## 📄 License

MIT
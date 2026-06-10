# 🛠️ Local Development Setup Guide

> How to run this project exactly as we run it in development —
> **Backend and frontend as raw Node processes, infrastructure (PostgreSQL + Redis) via Docker.**

---

## Prerequisites

Make sure you have these installed before starting:

| Tool | Version | Check | Install |
|---|---|---|---|
| **Node.js** | 18+ | `node -v` | [nodejs.org](https://nodejs.org) |
| **npm** | 8+ | `npm -v` | comes with Node |
| **Docker Desktop** | any | `docker -v` | [docker.com](https://www.docker.com/products/docker-desktop) |
| **Git** | any | `git -v` | [git-scm.com](https://git-scm.com) |

> **Why Docker only for infrastructure?**
> PostgreSQL requires the `pgvector` extension which is painful to install locally. Docker gives us a pre-built image with it. Redis is also easiest via Docker. The backend and frontend run as plain Node processes so you get hot-reload and direct log output.

---

## Third-Party Accounts You Need to Create

You need **2 API keys** — both are free with no credit card required.

---

### 1. Groq API Key (for LLM — text generation)

> Groq provides free access to open-source models like Llama 3.3 70B at extremely high speed.

**Steps:**
1. Go to [console.groq.com](https://console.groq.com)
2. Click **Sign Up** → create an account (Google/GitHub login works)
3. Once inside the console, click **API Keys** in the left sidebar
4. Click **Create API Key** → give it a name (e.g. `rag-dev`)
5. **Copy the key immediately** — it will not be shown again
6. It looks like: `gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

**Free plan limits:**
- `llama-3.3-70b-versatile` — 14,400 tokens/minute, 1,000 requests/day
- `llama-3.1-8b-instant` — 20,000 tokens/minute (used by query rewriter)
- More than enough for development and testing

---

### 2. HuggingFace API Key (for Embeddings — text → vectors)

> HuggingFace hosts open-source embedding models. We use `sentence-transformers/all-MiniLM-L6-v2` which converts text to 384-dimension vectors.

**Steps:**
1. Go to [huggingface.co](https://huggingface.co)
2. Click **Sign Up** → create a free account
3. Click your profile picture → **Settings**
4. In the left sidebar, click **Access Tokens**
5. Click **New token** → Name: `rag-dev` → Role: **Read** → click **Generate a token**
6. **Copy the token** — it looks like: `hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

**Free plan:**
- Inference API is free for non-commercial use
- Rate limited but more than enough for development
- Embedding cache (Redis 24h TTL) means most requests never hit the API

---

## Step-by-Step Setup

### Step 1 — Clone the Repository

```bash
git clone https://github.com/muhmdshanub/ai-rag-pdf-chat.git
cd ai-rag-pdf-chat
```

---

### Step 2 — Start Infrastructure (PostgreSQL + Redis via Docker)

```bash
docker-compose up -d postgres redis
```

This starts only the database and cache containers (not the backend or frontend).

**Verify they're running:**
```bash
docker ps
```

You should see two containers:
```
CONTAINER ID   IMAGE                    STATUS         PORTS
xxxxxxxxxxxx   pgvector/pgvector:pg16   Up (healthy)   0.0.0.0:15432->5432/tcp
xxxxxxxxxxxx   redis:7-alpine           Up (healthy)   0.0.0.0:6379->6379/tcp
```

> **Note:** PostgreSQL runs on port **15432** (not the default 5432) to avoid conflicts with any locally installed PostgreSQL. Redis runs on the standard **6379**.

---

### Step 3 — Create the Backend `.env` File

```bash
cd backend
cp .env.example .env
```

If `.env.example` doesn't exist, create `backend/.env` manually with this content:

```env
# ─── Server ────────────────────────────────────────────
NODE_ENV=development
PORT=5000

# ─── Database ──────────────────────────────────────────
# Port 15432 matches the docker-compose port mapping
DATABASE_URL=postgresql://dev:dev123@localhost:15432/rag_chat

# ─── Cache & Queue ─────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── AI APIs (Required) ────────────────────────────────
GROQ_API_KEY=gsk_your_actual_key_here
HUGGINGFACE_API_KEY=hf_your_actual_key_here

# ─── CORS ──────────────────────────────────────────────
# Must include the frontend URL
CORS_ORIGINS=http://localhost:3000

# ─── File Upload ───────────────────────────────────────
UPLOAD_DIR=./uploads
PDF_PARSER_MAX_FILE_SIZE=104857600

# ─── LLM Settings (Optional — these are the defaults) ──
LLM_DEFAULT_MODEL=llama-3.3-70b-versatile
LLM_DEFAULT_TEMPERATURE=0.1
LLM_MAX_TOKENS=1024

# ─── RAG Tuning (Optional — these are the defaults) ────
RAG_RECALL_K=30
RAG_MIN_SIMILARITY=0.25
RAG_MAX_CONTEXT_CHARS=12000

# ─── Query Rewriting ───────────────────────────────────
RAG_QUERY_REWRITER_ENABLED=true
RAG_QUERY_REWRITER_MODEL=llama-3.1-8b-instant
RAG_QUERY_REWRITER_TIMEOUT_MS=2000

# ─── MMR Diversification ───────────────────────────────
RAG_MMR_ENABLED=true
RAG_MMR_LAMBDA=0.7

# ─── Cross-Encoder Re-ranking (off by default) ─────────
RAG_RERANKER_ENABLED=false
RAG_RERANKER_MODEL=cross-encoder/ms-marco-MiniLM-L-6-v2

# ─── Chunking ──────────────────────────────────────────
CHUNKING_CHUNK_SIZE=800
CHUNKING_OVERLAP_SIZE=200
CHUNKING_MIN_CHUNK_SIZE=50
```

> ⚠️ Replace `gsk_your_actual_key_here` and `hf_your_actual_key_here` with your real keys.
> Never commit `.env` to git — it is already in `.gitignore`.

---

### Step 4 — Install Backend Dependencies

```bash
# You should already be inside the backend/ folder
npm install
```

---

### Step 5 — Run Database Migrations

There are 2 migration files that must be applied in order:

**Migration 1** — Creates all tables (documents, chunks, chat_messages) and pgvector extension:
```bash
npm run db:init
```

Expected output:
```
✅ Database schema initialized successfully
✅ Database initialized. Exiting.
```

**Migration 2** — Adds the `fts_vector` column and GIN index for Full Text Search (Hybrid Search):
```bash
cd ..
node run_migration.js
cd backend
```

Expected output:
```
Connecting to database...
Executing migration 002_add_fts_hybrid_search.sql...
✅ Migration applied successfully.
```

> Both migrations are **idempotent** — safe to re-run. They use `IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.

---

### Step 6 — Start the Backend

```bash
# Inside backend/ folder
npm run dev
```

Expected output:
```
[nodemon] starting `node src/server.js`
info: 🚀 Server running on port 5000
info: Database connected successfully
info: Redis connected successfully
info: BullMQ worker started, listening for jobs...
```

The backend is now running at **http://localhost:5000**.

> `npm run dev` uses **nodemon** which auto-restarts the server on any file change inside `src/`.

---

### Step 7 — Install Frontend Dependencies and Start

Open a **new terminal** (keep the backend running in the first):

```bash
cd ai-rag-pdf-chat/frontend
npm install
npm run dev
```

Expected output:
```
  VITE v5.x.x  ready in 300ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://0.0.0.0:3000/
```

The frontend is now running at **http://localhost:3000**.

> The Vite dev server proxies all `/api` requests to `http://localhost:5000` automatically — no CORS issues, no need to change the frontend API URL.

---

### Step 8 — Verify Everything Works

Open your browser to **http://localhost:3000**

You should see the chat UI. Try:
1. Upload a PDF using the upload button
2. Wait for the "Ready to chat" status (usually 5–30 seconds depending on PDF size)
3. Type a question about the PDF

**Quick backend health check:**
```bash
curl http://localhost:5000/api/documents
```
Should return: `{"success":true,"data":{"documents":[]},...}`

---

## Running Terminals Summary

You need **3 things running** at the same time:

| What | How | Port |
|---|---|---|
| PostgreSQL (Docker) | `docker-compose up -d postgres redis` | 15432 |
| Redis (Docker) | (included above) | 6379 |
| Backend (Node) | `cd backend && npm run dev` | 5000 |
| Frontend (Vite) | `cd frontend && npm run dev` | 3000 |

Typical terminal layout:
```
Terminal 1 (keep open for logs):  cd backend && npm run dev
Terminal 2 (keep open for logs):  cd frontend && npm run dev
Terminal 3 (for ad-hoc commands): docker ps, curl, etc.
```

---

## Stopping Everything

```bash
# Stop backend: Ctrl+C in the backend terminal
# Stop frontend: Ctrl+C in the frontend terminal

# Stop Docker containers (keeps data):
docker-compose stop

# Stop Docker containers AND delete all data:
docker-compose down -v
```

---

## Useful Commands

### View Docker logs
```bash
docker logs rag_chat_postgres
docker logs rag_chat_redis
```

### Connect directly to the database
```bash
docker exec -it rag_chat_postgres psql -U dev -d rag_chat
```

Useful SQL to run inside psql:
```sql
-- See all documents
SELECT id, original_name, status, total_chunks FROM documents;

-- Count chunks per document
SELECT document_id, COUNT(*) FROM chunks GROUP BY document_id;

-- Check FTS index exists
SELECT indexname FROM pg_indexes WHERE tablename = 'chunks';

-- Check pgvector is installed
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### Connect directly to Redis
```bash
docker exec -it rag_chat_redis redis-cli

# Inside redis-cli:
KEYS *          # list all keys
DBSIZE          # count all keys
FLUSHALL        # clear all cache (forces fresh embeddings)
```

### Reset the database (wipe everything and start fresh)
```bash
docker-compose down -v           # destroys all data volumes
docker-compose up -d postgres redis
cd backend && npm run db:init    # re-run migration 1
cd .. && node run_migration.js   # re-run migration 2
```

---

## Troubleshooting

### `Error: Config validation error: "DATABASE_URL" is required`
→ The `.env` file is missing or not in the `backend/` folder. Make sure `backend/.env` exists.

### `Error: connect ECONNREFUSED 127.0.0.1:15432`
→ PostgreSQL container is not running. Run `docker-compose up -d postgres redis` first.

### `Error: connect ECONNREFUSED 127.0.0.1:6379`
→ Redis container is not running. Same fix as above.

### `Error: HuggingFace API — 401 Unauthorized`
→ Your `HUGGINGFACE_API_KEY` in `.env` is wrong or missing. Double-check the key from [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).

### `Error: Groq API — 401 Invalid API Key`
→ Your `GROQ_API_KEY` in `.env` is wrong. Re-copy it from [console.groq.com/keys](https://console.groq.com/keys).

### `Error: relation "chunks" does not exist`
→ Migrations haven't been run. Follow Step 5 above.

### `Error: column "fts_vector" does not exist`
→ Migration 2 hasn't been run. Run `node run_migration.js` from the project root.

### Backend keeps restarting / `nodemon` crash loop
→ Check the terminal for the actual error. Usually a missing `.env` key or a syntax error in a recently edited file.

### Frontend shows "Network Error" or blank page
→ Check that the backend is running at port 5000. The Vite proxy requires the backend to be up.

---

## Environment Variables — Full Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | Environment mode |
| `PORT` | no | `5000` | Backend HTTP port |
| `DATABASE_URL` | **yes** | — | PostgreSQL connection string |
| `REDIS_URL` | **yes** | — | Redis connection string |
| `GROQ_API_KEY` | no* | — | Groq API key for LLM answers |
| `HUGGINGFACE_API_KEY` | **yes** | — | HuggingFace key for embeddings |
| `CORS_ORIGINS` | no | `http://localhost:3000` | Comma-separated allowed origins |
| `UPLOAD_DIR` | no | `./uploads` | Folder for uploaded PDFs |
| `PDF_PARSER_MAX_FILE_SIZE` | no | `104857600` (100MB) | Max upload size in bytes |
| `LLM_DEFAULT_MODEL` | no | `llama-3.3-70b-versatile` | Groq model to use |
| `LLM_DEFAULT_TEMPERATURE` | no | `0.1` | LLM temperature (0=deterministic) |
| `LLM_MAX_TOKENS` | no | `1024` | Max tokens in LLM response |
| `RAG_RECALL_K` | no | `30` | Candidate chunks retrieved before filtering |
| `RAG_MIN_SIMILARITY` | no | `0.25` | Hard similarity floor (0–1) |
| `RAG_MAX_CONTEXT_CHARS` | no | `12000` | Max context characters sent to LLM |
| `RAG_QUERY_REWRITER_ENABLED` | no | `true` | Enable LLM keyword extraction for FTS |
| `RAG_QUERY_REWRITER_MODEL` | no | `llama-3.1-8b-instant` | Model for query rewriting |
| `RAG_QUERY_REWRITER_TIMEOUT_MS` | no | `2000` | Timeout before fallback |
| `RAG_MMR_ENABLED` | no | `true` | Enable MMR deduplication |
| `RAG_MMR_LAMBDA` | no | `0.7` | MMR lambda (0=diversity, 1=relevance) |
| `RAG_RERANKER_ENABLED` | no | `false` | Enable cross-encoder re-ranking |
| `RAG_RERANKER_MODEL` | no | `cross-encoder/ms-marco-MiniLM-L-6-v2` | HuggingFace re-ranking model |
| `CHUNKING_CHUNK_SIZE` | no | `800` | Characters per chunk |
| `CHUNKING_OVERLAP_SIZE` | no | `200` | Overlap characters between chunks |
| `CHUNKING_MIN_CHUNK_SIZE` | no | `50` | Minimum chunk size to keep |

> *`GROQ_API_KEY` is technically optional in the schema (allows empty string) but required in practice for the LLM to work. Without it, all chat requests will fail.

---

## Project URL Map (Local Development)

| URL | What it is |
|---|---|
| `http://localhost:3000` | Frontend (React/Vite dev server) |
| `http://localhost:5000` | Backend API (Express) |
| `http://localhost:5000/api/documents` | List all documents |
| `http://localhost:5000/api/upload` | Upload a PDF |
| `http://localhost:5000/api/chat` | Ask a question |
| `localhost:15432` | PostgreSQL (connect via psql or TablePlus) |
| `localhost:6379` | Redis (connect via redis-cli or RedisInsight) |

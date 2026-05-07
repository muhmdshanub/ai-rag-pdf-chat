# 🏗️ Infrastructure Setup Plan

## Overview

Setting up the local development infrastructure for the AI RAG PDF Chat app. Everything runs as Docker containers via docker-compose. **No S3 — local file storage only for now.**

---

## What We'll Create

### Top-Level Files (project root)
| File | Purpose |
|------|---------|
| `docker-compose.yml` | Orchestrates all 4 containers |
| `docker-compose.dev.yml` | Dev overrides (hot reload, volume mounts) |
| `.env.example` | Template for environment variables |
| `.env` | Actual env vars (gitignored) |

### Backend Folder Structure
```
backend/
├── Dockerfile
├── .dockerignore
├── package.json              (updated with scripts)
├── .env.example
├── src/
│   ├── server.js             ← Entry point
│   ├── app.js                ← Express app setup (separated from server)
│   │
│   ├── config/
│   │   ├── index.js          ← Central config (loads .env, exports all config)
│   │   ├── database.js       ← PostgreSQL pool + pgvector init
│   │   └── redis.js          ← Redis client setup
│   │
│   ├── routes/
│   │   ├── index.js          ← Route aggregator
│   │   ├── health.routes.js  ← GET /api/health
│   │   ├── upload.routes.js  ← POST /api/upload
│   │   ├── chat.routes.js    ← POST /api/chat
│   │   └── document.routes.js← GET/DELETE /api/documents
│   │
│   ├── controllers/
│   │   ├── health.controller.js
│   │   ├── upload.controller.js
│   │   ├── chat.controller.js
│   │   └── document.controller.js
│   │
│   ├── services/
│   │   ├── storage.service.js     ← Local file storage (abstracted for future S3/R2)
│   │   ├── pdf-parser.service.js  ← Extract text from PDFs
│   │   ├── chunking.service.js    ← Split text into overlapping chunks
│   │   ├── embedding.service.js   ← Generate vector embeddings
│   │   ├── rag.service.js         ← Vector similarity search + context building
│   │   └── llm.service.js         ← Call Groq API
│   │
│   ├── models/
│   │   ├── document.model.js      ← Document DB operations
│   │   ├── chunk.model.js         ← Chunk DB operations
│   │   └── chat-message.model.js  ← Chat history DB operations
│   │
│   ├── middleware/
│   │   ├── error-handler.js       ← Global error handler
│   │   ├── request-logger.js      ← Log all requests
│   │   ├── validate.js            ← Request validation
│   │   └── upload.js              ← Multer config for file uploads
│   │
│   ├── jobs/
│   │   ├── queue.js               ← Bull queue setup
│   │   └── process-document.job.js← Async PDF processing worker
│   │
│   ├── db/
│   │   ├── init.js                ← DB initialization (tables + extensions)
│   │   └── migrations/            ← Future migration scripts
│   │       └── 001_initial_schema.sql
│   │
│   └── utils/
│       ├── logger.js              ← Winston logger setup
│       └── errors.js              ← Custom error classes
│
├── uploads/                       ← Local file storage (gitignored)
│   └── .gitkeep
│
└── tests/                         ← Future tests
    └── .gitkeep
```

---

## Docker Containers (4 total)

```
┌───────────────────────────────────────────────────────────────┐
│                    Docker Network (rag_network)                │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  1. PostgreSQL + pgvector     (port 5432)                    │
│     └─ Volume: postgres_data                                 │
│                                                               │
│  2. Redis                     (port 6379)                    │
│     └─ No volume (ephemeral cache for dev)                   │
│                                                               │
│  3. Backend (Express.js)      (port 5000)                    │
│     └─ Volume mount: ./backend → /app (hot reload)           │
│     └─ Volume: uploads_data (PDF storage)                    │
│                                                               │
│  4. Frontend (React+Vite)     (port 3000)                    │
│     └─ Volume mount: ./frontend → /app (hot reload)          │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Storage Strategy

**Current:** Local filesystem (`./backend/uploads/`)
- Mounted as a Docker volume so files persist across container restarts
- Abstracted behind `storage.service.js` so switching to S3/R2 later requires **zero controller changes**

```
./backend/uploads/
├── 1704067200000-kubernetes.pdf
├── 1704067300000-react-guide.pdf
└── temp/          ← For processing intermediates
```

---

## Key Design Decisions

| Decision | Why |
|----------|-----|
| Separate `app.js` from `server.js` | Enables testing the Express app without starting the server |
| `config/index.js` as central config | Single source of truth for all env vars, validated at startup |
| `storage.service.js` abstraction | Swap local → S3/R2 without touching controllers |
| `db/init.js` for schema | Auto-creates tables on first run, idempotent |
| `.dockerignore` | Prevents `node_modules` from being copied into the image |
| Dev compose override | Keeps prod compose clean; dev adds hot reload + volume mounts |

---

## Files to Create (in order)

1. **Top-level**: `docker-compose.yml`, `.env.example`
2. **Backend**: `Dockerfile`, `.dockerignore`, updated `package.json`
3. **Backend src**: `server.js`, `app.js`, `config/*`, `db/*`, `middleware/*`, `routes/*`, `utils/*`
4. **Backend placeholder files**: Controllers, services, models (with basic exports)
5. **SQL migration**: `001_initial_schema.sql`

> [!NOTE]
> Frontend Dockerfile will be a simple dev Dockerfile (just runs `npm run dev`) since we're not deploying yet.

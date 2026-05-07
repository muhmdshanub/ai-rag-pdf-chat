# AI RAG PDF Chat - Complete Infrastructure Design

## 📊 8-Layer Architecture Overview

Your application is organized into 8 distinct layers, each with specific responsibilities:

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: PRESENTATION (Frontend)                               │
│ React + Vite (User Facing)                                      │
├─────────────────────────────────────────────────────────────────┤
│ Layer 2: API GATEWAY (Express.js Server)                        │
│ REST API with CORS, Error Handling, Request Validation          │
├─────────────────────────────────────────────────────────────────┤
│ Layer 3: CONTROLLERS & SERVICES                                 │
│ Upload Handler, Chat Controller, Document Manager, Job Queue    │
├─────────────────────────────────────────────────────────────────┤
│ Layer 4: AI PROCESSING SERVICES                                 │
│ PDF Parser, Chunking, Embeddings, RAG Retrieval, LLM Service    │
├─────────────────────────────────────────────────────────────────┤
│ Layer 5: THIRD-PARTY INTEGRATIONS                               │
│ Groq API (LLM), HuggingFace (Embeddings), etc                   │
├─────────────────────────────────────────────────────────────────┤
│ Layer 6: DATA STORAGE                                           │
│ PostgreSQL (Vector + Relational), File Storage (S3/Local)       │
├─────────────────────────────────────────────────────────────────┤
│ Layer 7: CACHING & MESSAGE QUEUE                                │
│ Redis (Cache + Bull Job Queue)                                  │
├─────────────────────────────────────────────────────────────────┤
│ Layer 8: DEPLOYMENT & MONITORING                                │
│ Docker, Railway/Render, Logging & Metrics                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Layer-by-Layer Breakdown

### **LAYER 1: PRESENTATION LAYER**

**What it does:** User interface and interaction point.

**Technologies:**
- **React 18** - Component framework
- **Vite** - Build tool (faster than Webpack)
- **Tailwind CSS** - Styling
- **Axios** - HTTP client

**Components:**
```
src/
├── components/
│   ├── FileUpload.jsx          → Drag-drop PDF upload
│   ├── ChatInterface.jsx        → Q&A chat bubble interface
│   ├── DocumentList.jsx         → Sidebar listing uploaded docs
│   └── Sidebar.jsx              → Navigation wrapper
├── pages/
│   └── Home.jsx                 → Main app page
├── hooks/
│   ├── useChat.js               → Chat state management
│   ├── useDocuments.js          → Document list state
│   └── useUpload.js             → Upload progress state
├── api/
│   └── client.js                → Axios instance (base URL, interceptors)
├── App.jsx
└── main.jsx
```

**Key Features:**
- Real-time upload progress feedback
- WebSocket or polling for async job status
- Message streaming (if using SSE for LLM responses)
- Responsive design (desktop & mobile)

**Deployment:**
- Build: `npm run build` → static `dist/` folder
- Host on: Vercel, Netlify, or Railway static service

---

### **LAYER 2: API GATEWAY / SERVER LAYER**

**What it does:** Central HTTP endpoint, authentication, request routing, response formatting.

**Technology:** Express.js

**File Structure:**
```
backend/src/
├── server.js                   → Entry point, middleware setup
├── routes/
│   ├── upload.js               → POST /api/upload
│   ├── chat.js                 → POST /api/chat
│   └── documents.js            → GET /api/documents, DELETE /api/documents/:id
├── middleware/
│   ├── errorHandler.js         → Global error catching
│   ├── cors.js                 → CORS configuration
│   ├── auth.js                 → JWT (for future auth)
│   └── validation.js           → Request body validation
└── config/
    └── env.js                  → Load environment variables
```

**API Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/upload` | Upload PDF/TXT file, trigger job queue |
| POST | `/api/chat` | Send query, retrieve + generate answer |
| GET | `/api/documents` | List all uploaded documents |
| GET | `/api/documents/:id` | Get specific document details |
| DELETE | `/api/documents/:id` | Delete document + associated chunks |
| GET | `/api/health` | Health check |

**Middleware Stack:**
```javascript
// server.js
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(requestLogger);           // Log all requests
app.use(validation);              // Validate request bodies
app.use('/uploads', express.static('./uploads'));  // Serve uploaded files

// Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/documents', documentRoutes);

// Error handling (LAST)
app.use(errorHandler);
```

**Request Flow:**
```
Client Request
    ↓
[Express Middleware]
    ↓ (validate, log, parse)
[Route Handler]
    ↓ (route to correct endpoint)
[Controller]
    ↓ (call services)
[Service Logic]
    ↓ (do actual work)
[Database/External API]
    ↓ (get response)
[Format Response]
    ↓
[Send to Client]
```

---

### **LAYER 3: CONTROLLERS & SERVICES**

**What it does:** Business logic, orchestration of services, database operations.

**Architecture Pattern:** MVC (Model-View-Controller)

**Controllers** (Handle HTTP requests):
```
controllers/
├── uploadController.js
│   └── exports.uploadDocument()
│       - Parse multipart form
│       - Validate file (size, type)
│       - Save to disk
│       - Create DB record
│       - Queue async job
│
├── chatController.js
│   └── exports.chat()
│       - Get user query
│       - Call RAG service
│       - Call LLM service
│       - Return answer
│
└── documentController.js
    ├── exports.listDocuments()
    ├── exports.deleteDocument()
    └── exports.getDocumentDetails()
```

**Example Controller Code:**
```javascript
// controllers/chatController.js
const embeddingService = require('../services/embeddingService');
const ragService = require('../services/ragService');
const llmService = require('../services/llmService');

exports.chat = async (req, res) => {
  try {
    const { documentId, message } = req.body;
    
    // 1. Convert question to vector
    const queryEmbedding = await embeddingService.getEmbedding(message);
    
    // 2. Retrieve similar chunks
    const chunks = await ragService.retrieveChunks(queryEmbedding, documentId);
    
    // 3. Call LLM with context
    const answer = await llmService.generateAnswer(message, chunks);
    
    // 4. Return response
    res.json({ answer, chunksUsed: chunks.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
```

**Services** (Reusable business logic):
```
services/
├── pdfParser.js
│   - Extract text from PDF files
│   - Get metadata (pages, title)
│
├── chunkingService.js
│   - Split text into overlapping chunks
│   - Control chunk size & overlap
│
├── embeddingService.js
│   - Call embedding API (HuggingFace)
│   - Cache embeddings in Redis
│   - Handle batch requests
│
├── ragService.js
│   - Vector similarity search
│   - Build context from chunks
│   - Format prompt for LLM
│
└── llmService.js
    - Call Groq API
    - Handle rate limiting
    - Parse LLM response
    - Track token usage
```

---

### **LAYER 4: AI PROCESSING SERVICES**

**What it does:** All AI-related operations (embedding, retrieval, generation).

**Service: PDF Parser**
```javascript
class PDFParserService {
  async extractText(filePath) {
    // Use: pdf-parse library
    // Returns: { text, pages, metadata }
  }
}
```

**Service: Chunking**
```javascript
class ChunkingService {
  chunk(text, chunkSize = 500, overlap = 100) {
    // Split text into overlapping chunks
    // Example: "hello world foo bar baz"
    // Chunk 1: "hello world foo"
    // Chunk 2: "foo bar baz" (overlap = "foo")
  }
}
```

**Service: Embedding**
```javascript
class EmbeddingService {
  async getEmbedding(text) {
    // Call HuggingFace API
    // Input:  "What is RAG?"
    // Output: [0.23, 0.45, 0.67, ...] (384 dimensions)
  }
}
```

**Service: RAG (Retrieval)**
```javascript
class RAGService {
  async retrieveRelevantChunks(queryEmbedding, documentId, topK = 5) {
    // Use pgvector to find similar chunks
    // Query: "SELECT ... ORDER BY embedding <=> $1 LIMIT 5"
    // Returns: Top 5 most similar chunks
  }
  
  buildContext(chunks) {
    // Combine chunks into a single text block
    return "[Chunk 1]: ...\n\n[Chunk 2]: ...\n\n[Chunk 3]: ...";
  }
  
  buildPrompt(question, context) {
    // Create prompt: "Context: {...}\n\nQuestion: {...}"
  }
}
```

**Service: LLM**
```javascript
class LLMService {
  async generateAnswer(systemPrompt, userPrompt) {
    // Call Groq API
    // Input:  { role: "user", content: userPrompt }
    // Output: "The answer is..."
    // Groq models: mixtral-8x7b, llama2-70b
  }
}
```

---

### **LAYER 5: THIRD-PARTY INTEGRATIONS**

**What it does:** Connect to external AI services and APIs.

**Third-Party Services:**

| Service | Purpose | Free Tier | What We Use |
|---------|---------|-----------|------------|
| **Groq** | LLM Inference | Yes (very fast) | Text generation, RAG answers |
| **HuggingFace** | Embeddings | Yes | Convert text → vectors |
| **Pinecone** | Vector DB (Future) | Yes (free tier) | Alternative to pgvector |
| **Together AI** | Alternative LLM | Yes | Fallback if Groq down |
| **S3 / CloudFlare R2** | File Storage | Free tier available | Store PDFs (future) |

**API Keys in `.env`:**
```env
# Primary services
GROQ_API_KEY=gsk_xxxxx
HUGGINGFACE_API_KEY=hf_xxxxx

# Fallback/Future
TOGETHER_AI_API_KEY=xxxx
AWS_S3_KEY=xxxx
```

**Error Handling & Fallbacks:**
```javascript
// llmService.js
async generateAnswer(prompt) {
  try {
    return await callGroq(prompt);
  } catch (error) {
    if (error.code === 'RATE_LIMIT') {
      // Queue for retry
      return await queue.add('llm-retry', { prompt });
    }
    if (error.code === 'SERVICE_DOWN') {
      // Fallback to Together AI
      return await callTogetherAI(prompt);
    }
    throw error;
  }
}
```

---

### **LAYER 6: DATA STORAGE LAYER**

**What it does:** Persist all data (documents, chunks, embeddings, messages).

**Primary: PostgreSQL + pgvector**

```sql
-- Table: documents
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(500),
  file_size INT,
  status VARCHAR(50),              -- 'processing', 'completed', 'failed'
  total_chunks INT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Table: chunks (with embeddings)
CREATE TABLE chunks (
  id SERIAL PRIMARY KEY,
  document_id INT REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT,
  text TEXT NOT NULL,
  embedding vector(384),           -- pgvector stores ML embeddings
  created_at TIMESTAMP,
  UNIQUE(document_id, chunk_index)
);

-- Index for fast similarity search
CREATE INDEX idx_chunks_embedding
ON chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Table: chat_messages
CREATE TABLE chat_messages (
  id SERIAL PRIMARY KEY,
  document_id INT REFERENCES documents(id),
  user_message TEXT NOT NULL,
  ai_response TEXT,
  retrieved_chunks INT[],          -- Array of chunk IDs used
  tokens_used INT,                 -- For tracking LLM costs
  created_at TIMESTAMP
);

-- Future: users table (for multi-user support)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  created_at TIMESTAMP
);
```

**Vector Search Example:**
```javascript
// Find most similar chunks to a query
const query = `
  SELECT 
    id, text, 
    1 - (embedding <=> $1::vector) as similarity
  FROM chunks
  WHERE document_id = $2
  ORDER BY embedding <=> $1::vector
  LIMIT 5;
`;
```

**File Storage:**
```
uploads/
├── 1704067200000-kubernetes-docs.pdf
├── 1704067300000-react-guide.pdf
└── temp/
    ├── processing-123.txt
    └── temp-456.txt
```

**Scaling Consideration:** For large deployments, move to:
- **Pinecone** for vector DB (managed, scales automatically)
- **S3** for file storage (unlimited, CDN integration)
- **RDS Aurora** for PostgreSQL (auto-scaling, backups)

---

### **LAYER 7: CACHING & MESSAGE QUEUE LAYER**

**What it does:** Improve performance, handle async jobs, manage session state.

**Redis Setup:**
```yaml
# docker-compose.yml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
```

**Redis Use Cases:**

**1. Session Caching**
```javascript
// Cache user session
await redis.set(`session:${userId}`, JSON.stringify(sessionData), 'EX', 3600);
const session = await redis.get(`session:${userId}`);
```

**2. Embedding Cache (Avoid Re-computing)**
```javascript
// Cache embeddings by text hash
const hash = crypto.createHash('sha256').update(text).digest('hex');
const cached = await redis.get(`embedding:${hash}`);

if (cached) {
  return JSON.parse(cached);  // Return cached embedding
}

// Compute and cache
const embedding = await callEmbeddingAPI(text);
await redis.set(`embedding:${hash}`, JSON.stringify(embedding), 'EX', 86400);
return embedding;
```

**3. Frequently Accessed Data**
```javascript
// Cache top chunks for fast retrieval
await redis.zadd(
  `doc:${docId}:chunks`,
  similarity_score,
  JSON.stringify(chunk)
);
```

**Bull Job Queue (Async Processing)**

```javascript
// Queue: process-document
const uploadQueue = new Queue('document-processing', redisUrl);

uploadQueue.process('process-document', async (job) => {
  const { documentId, filePath } = job.data;
  
  // 1. Extract text
  const text = await pdfParser.extractText(filePath);
  
  // 2. Chunk
  const chunks = chunkingService.chunk(text);
  
  // 3. Embed & Store (in background)
  for (const chunk of chunks) {
    const embedding = await embeddingService.getEmbedding(chunk);
    await db.query('INSERT INTO chunks ...');
  }
  
  // Mark as complete
  await db.query('UPDATE documents SET status = $1 WHERE id = $2', 
    ['completed', documentId]
  );
});
```

**Job Flow:**
```
User uploads PDF
    ↓
Express receives request
    ↓
Save file to disk
    ↓
Create DB record (status = 'processing')
    ↓
Queue job: { documentId, filePath }
    ↓
Return immediately to user: "Processing..."
    ↓
Bull Queue processes job in background
    ↓
Extract → Chunk → Embed → Store
    ↓
Update DB (status = 'completed')
    ↓
Frontend polls: GET /api/documents/:id
    ↓
User sees "Ready to chat" when status = 'completed'
```

**Advantages of Async Processing:**
- User doesn't wait for PDF processing (could take 5-10s)
- Server doesn't block on CPU-intensive tasks
- Can retry failed jobs automatically
- Scale job processors independently

---

### **LAYER 8: DEPLOYMENT & MONITORING**

**What it does:** Package, deploy, and monitor the application.

**Docker Containerization**

```dockerfile
# backend/Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 5000
CMD ["node", "src/server.js"]
```

```yaml
# docker-compose.yml (Local Development)
version: '3.8'
services:
  postgres:
    image: pgvector/pgvector:pg15
    environment:
      POSTGRES_DB: rag_chat
      POSTGRES_PASSWORD: dev123
    ports:
      - "5432:5432"
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
  
  backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      DATABASE_URL: postgresql://...
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis
  
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
```

**Deployment Platforms**

**Option A: Railway.app (Recommended for Beginners)**
```
- Free tier: 5GB storage, $5/month compute credits
- Deploy: Push to GitHub, Railway auto-deploys
- Built-in PostgreSQL, Redis, secrets management
- Simple dashboard
```

**Option B: Render.com**
```
- Free tier: Limited but enough for MVP
- Services: Node backend, PostgreSQL, Redis
- Auto-deploy on GitHub push
- Good for production-grade apps
```

**Environment Variables (Production)**
```env
# Database
DATABASE_URL=postgresql://user:pass@db.railway.app:5432/rag_chat

# Redis
REDIS_URL=redis://cache.railway.app:6379

# API Keys
GROQ_API_KEY=gsk_xxxxx
HUGGINGFACE_API_KEY=hf_xxxxx

# App
NODE_ENV=production
PORT=5000
```

**Monitoring & Logging**

```javascript
// src/middleware/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Log API requests
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    path: req.path,
    timestamp: new Date(),
  });
  next();
});

// Track LLM usage
app.post('/api/chat', async (req, res) => {
  const startTime = Date.now();
  const response = await llmService.generate(prompt);
  
  logger.info({
    event: 'llm_call',
    tokens: response.tokens,
    latency: Date.now() - startTime,
    model: response.model,
  });
});
```

**Metrics to Track**
- API response time
- LLM token usage (for cost tracking)
- Database query time
- Error rates
- Queue job success/failure ratio
- Cache hit rate

---

## 🔄 Complete Request Flow (Chat Example)

Here's what happens when a user asks a question:

```
1. USER INPUT
   User types "How does RAG work?" in chat UI

2. FRONTEND (Layer 1)
   ChatInterface.jsx sends:
   POST /api/chat
   { documentId: 5, message: "How does RAG work?" }

3. API GATEWAY (Layer 2)
   Express receives request
   - Validates input
   - Logs request
   - Routes to /chat endpoint

4. CONTROLLER (Layer 3)
   chatController.chat()
   - Extracts { documentId, message }
   - Calls embedding service
   - Calls RAG service
   - Calls LLM service

5. EMBEDDING SERVICE (Layer 4)
   embeddingService.getEmbedding("How does RAG work?")
   - Check Redis cache first
   - If not cached: call HuggingFace API
   - Returns: [0.23, 0.45, 0.67, ...] (384-dim vector)
   - Store in Redis for next time

6. RAG SERVICE (Layer 4)
   ragService.retrieveChunks(queryEmbedding, documentId, topK=5)
   - PostgreSQL query:
     SELECT * FROM chunks
     WHERE document_id = 5
     ORDER BY embedding <=> queryEmbedding
     LIMIT 5
   - Returns: 5 most similar chunks

7. CONTEXT BUILDING (Layer 4)
   ragService.buildContext(chunks)
   - Concatenates: "[Chunk 1]: ...\n\n[Chunk 2]: ..."
   - Returns: Full context string

8. LLM SERVICE (Layer 4)
   llmService.generateAnswer(systemPrompt, userPrompt)
   - Calls Groq API with:
     {
       model: "mixtral-8x7b",
       messages: [
         { role: "system", content: "You are helpful..." },
         { role: "user", content: "Context: {...}\n\nQuestion: How does RAG work?" }
       ]
     }

9. EXTERNAL API (Layer 5)
   Groq API processes and returns:
   "RAG (Retrieval-Augmented Generation) combines retrieval and generation..."

10. DATABASE (Layer 6)
    Save to chat_messages table:
    - user_message: "How does RAG work?"
    - ai_response: "RAG (Retrieval-Augmented Generation)..."
    - retrieved_chunks: [12, 34, 56, 78, 90]
    - tokens_used: 342

11. RESPONSE (Layer 2)
    Express returns to frontend:
    {
      answer: "RAG (Retrieval-Augmented Generation)...",
      retrievedChunks: 5,
      tokensUsed: 342
    }

12. FRONTEND (Layer 1)
    ChatInterface displays response:
    - Shows answer in chat bubble
    - Displays "(Retrieved from 5 chunks)"
    - User can continue chatting
```

---

## 📈 Scaling Considerations

**As you grow:**

### Small Scale (100 users)
- Current setup is sufficient
- Single Express server
- Single PostgreSQL instance
- Single Redis instance

### Medium Scale (1K users)
- Need load balancer (distribute traffic)
- PostgreSQL read replicas (separate reads/writes)
- Separate Redis for sessions vs cache
- CDN for frontend assets

### Large Scale (10K+ users)
- Horizontal scaling (multiple backend servers)
- Managed PostgreSQL (AWS RDS, Supabase)
- Dedicated vector DB (Pinecone, Weaviate)
- S3 for file storage
- Message queue (SQS, RabbitMQ)
- Kubernetes orchestration

---

## 🎯 Summary: Which Layer Does What?

| Layer | Technology | Responsibility | Example |
|-------|-----------|-----------------|---------|
| 1 | React + Vite | User interface | Chat bubbles, file upload |
| 2 | Express.js | HTTP routing, middleware | Receive requests, send responses |
| 3 | Controllers | Business logic orchestration | Call services in right order |
| 4 | Services | Reusable AI logic | Embed text, retrieve chunks |
| 5 | Groq, HuggingFace | External AI | Generate answers, create vectors |
| 6 | PostgreSQL + pgvector | Persistent data | Store chunks, embeddings, messages |
| 7 | Redis + Bull | Caching, async jobs | Speed up queries, background processing |
| 8 | Docker, Railway | Packaging, deployment | Run everywhere, scale automatically |

---

## 🚀 Next Steps

1. **Understand this architecture** - diagram is your north star
2. **Implement Layer 2-4** - the core logic (services, controllers, routes)
3. **Test locally** - use docker-compose for Postgres + Redis
4. **Deploy** - push to Railway with `git push`
5. **Monitor** - watch logs, track token usage
6. **Scale** - add caching, replication as needed

This design is **production-ready** and **fully scalable**.
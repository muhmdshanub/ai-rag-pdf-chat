# Data Flow Diagrams - AI RAG System

## 1️⃣ FILE UPLOAD FLOW (Async Processing)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CLIENT (React)                                                          │
│ User selects PDF file                                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                                │
│ FileUpload.jsx                                                          │
│ - Read file from input                                                  │
│ - Create FormData                                                       │
│ - POST /api/upload (multipart/form-data)                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ EXPRESS SERVER (Layer 2)                                                │
│ POST /api/upload                                                        │
│ - multer middleware receives file                                       │
│ - Save to ./uploads/                                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ UPLOAD CONTROLLER (Layer 3)                                             │
│ uploadController.uploadDocument()                                       │
│                                                                          │
│ 1. Validate file (size, type)                                          │
│ 2. Save metadata to database:                                          │
│    INSERT INTO documents (filename, status, file_path)                 │
│    → Returns: documentId                                               │
│ 3. Queue async job:                                                    │
│    uploadQueue.add('process-document', {                               │
│      documentId, filePath                                              │
│    })                                                                   │
│ 4. Return: { success: true, documentId, status: 'processing' }         │
└─────────────────────────────────────────────────────────────────────────┘
                    │                                     │
                    ▼                                     ▼
            Redis Queue                          Database
            (Bull)                               (PostgreSQL)
            ┌────────────┐                      ┌──────────────┐
            │ Job Queue  │                      │ documents    │
            │ pending:   │                      │ id: 5        │
            │ {doc: 5}   │                      │ filename: .  │
            └────────────┘                      │ status: ..  │
                    │                           └──────────────┘
                    │
                    │ [Job Worker picks up after 0-1 sec]
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ BULL QUEUE WORKER (Background Process)                                  │
│ processDocumentJob.js                                                   │
│                                                                          │
│ 1. READ:   Get file from ./uploads/123-kubernetes.pdf                 │
│                                                                          │
│ 2. EXTRACT: PDF Parser → Text string                                   │
│    pdfParser.extractText(filePath)                                      │
│    → { text: "Chapter 1: Intro...", pages: 45 }                        │
│                                                                          │
│ 3. CHUNK:  Split text into chunks                                      │
│    chunkingService.chunk(text)                                          │
│    → [                                                                  │
│       { index: 0, text: "Chapter 1..." },                              │
│       { index: 1, text: "Introduction..." },                           │
│       ...                                                               │
│       { index: 89, text: "Conclusion..." }                             │
│      ]                                                                  │
│                                                                          │
│ 4. EMBED:  Convert each chunk to vector                                │
│    embeddingService.getEmbeddings(texts)                               │
│    → [                                                                  │
│       [0.23, 0.45, 0.67, ...],  (384 dims)                            │
│       [0.34, 0.56, 0.78, ...],                                         │
│       ...                                                               │
│      ]                                                                  │
│                                                                          │
│ 5. STORE:  Insert chunks + embeddings into database                    │
│    INSERT INTO chunks (document_id, chunk_index, text, embedding)      │
│    × 90 rows                                                            │
│                                                                          │
│ 6. UPDATE: Mark document as complete                                   │
│    UPDATE documents SET status='completed', total_chunks=90            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                            PostgreSQL
                            ┌────────────────────┐
                            │ chunks (90 rows)   │
                            │ ├─ id: 501-590     │
                            │ ├─ text: ...       │
                            │ ├─ embedding: [...] │
                            │ └─ document_id: 5  │
                            └────────────────────┘
                                    │
                                    ▼
                            Frontend Polling
                            GET /api/documents/5
                            ├─ status: 'completed'
                            └─ total_chunks: 90
                                    │
                                    ▼
                            User sees:
                            ✅ "Ready to chat"
                            (Chat button enabled)
```

---

## 2️⃣ CHAT FLOW (Synchronous - Real-time Answer)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CLIENT (React)                                                          │
│ User types: "How does Kubernetes networking work?"                     │
│ Clicks: SEND                                                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                                │
│ ChatInterface.jsx                                                       │
│ POST /api/chat                                                          │
│ {                                                                       │
│   documentId: 5,                                                        │
│   message: "How does Kubernetes networking work?"                      │
│ }                                                                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ EXPRESS SERVER                                                          │
│ POST /api/chat                                                          │
│ - Validate input                                                        │
│ - Route to chatController                                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ CHAT CONTROLLER (Layer 3)                                               │
│ chatController.chat()                                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
        ┌───────────────────────────┴───────────────────────────┐
        │                                                       │
        ▼                                                       ▼
    ┌─────────────────┐                              ┌──────────────────┐
    │ STEP 1: EMBED   │                              │ Redis Cache      │
    │ Question        │                              │ ┌──────────────┐ │
    └─────────────────┘                              │ │ Check: hash  │ │
        │                                             │ │ "How does.." │ │
        │ embeddingService                           │ │ HIT? No      │ │
        │ .getEmbedding()                            │ └──────────────┘ │
        │                                             └──────────────────┘
        │                          (not in cache)         │
        │                                                 ▼
        └─────────────────────────────────────────────────┘
                                    │
                    CALL HUGGINGFACE EMBEDDING API
        ┌───────────────────────────┘
        │
        ▼
    HuggingFace API
    ────────────────────
    Input:  "How does Kubernetes networking work?"
    Output: [0.12, 0.34, 0.56, 0.78, ...]  (384 dimensions)
        │
        │ (Save to Redis cache for 24h)
        ▼
    ┌─────────────────┐
    │ embedService    │
    │ Returns:        │
    │ queryEmbedding  │
    └─────────────────┘
                                    │
                                    ▼
        ┌───────────────────────────────────────────────────────┐
        │ STEP 2: RETRIEVE RELEVANT CHUNKS                      │
        │ ragService.retrieveChunks()                           │
        └───────────────────────────────────────────────────────┘
                                    │
                    Query PostgreSQL with pgvector
        ┌───────────────────────────┴───────────────────────────┐
        │                                                       │
        ▼                                                       ▼
    ┌────────────────────┐                            ┌────────────────┐
    │ Vector Similarity  │                            │ pgvector Index │
    │ Search             │                            │ IVFFLAT        │
    │                    │                            │                │
    │ SELECT id, text,   │◄───────────────────────────┤ Fast nearest   │
    │ embedding <=> $1   │  (uses index)              │ neighbor search│
    │ FROM chunks        │                            │                │
    │ WHERE document_id=5│                            └────────────────┘
    │ ORDER BY <=> DESC  │
    │ LIMIT 5            │
    └────────────────────┘
                                    │
                                    ▼
    ┌──────────────────────────────────────────────┐
    │ PostgreSQL Returns 5 Chunks:                 │
    │ ┌──────────────────────────────────────────┐ │
    │ │ Chunk #5 (similarity: 0.89)              │ │
    │ │ "Kubernetes networking uses CNI plugins" │ │
    │ ├──────────────────────────────────────────┤ │
    │ │ Chunk #23 (similarity: 0.87)             │ │
    │ │ "The kube-proxy manages service routing" │ │
    │ ├──────────────────────────────────────────┤ │
    │ │ Chunk #67 (similarity: 0.81)             │ │
    │ │ "Pod-to-Pod communication uses overlay"  │ │
    │ ├──────────────────────────────────────────┤ │
    │ │ Chunk #45 (similarity: 0.76)             │ │
    │ │ "Services provide load balancing"        │ │
    │ ├──────────────────────────────────────────┤ │
    │ │ Chunk #89 (similarity: 0.72)             │ │
    │ │ "DNS resolves service names automatically"│ │
    │ └──────────────────────────────────────────┘ │
    └──────────────────────────────────────────────┘
                                    │
                                    ▼
        ┌───────────────────────────────────────────────────────┐
        │ STEP 3: BUILD CONTEXT                                │
        │ ragService.buildContext(chunks)                      │
        └───────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌──────────────────────────────────────────────────────────┐
    │ Context String (concatenated):                           │
    │                                                          │
    │ [Chunk 5]:                                               │
    │ Kubernetes networking uses CNI plugins...                │
    │                                                          │
    │ [Chunk 23]:                                              │
    │ The kube-proxy manages service routing...                │
    │                                                          │
    │ [Chunk 67]:                                              │
    │ Pod-to-Pod communication uses overlay...                 │
    │                                                          │
    │ [Chunk 45]:                                              │
    │ Services provide load balancing...                       │
    │                                                          │
    │ [Chunk 89]:                                              │
    │ DNS resolves service names automatically...              │
    └──────────────────────────────────────────────────────────┘
                                    │
                                    ▼
        ┌───────────────────────────────────────────────────────┐
        │ STEP 4: BUILD RAG PROMPT                              │
        │ ragService.buildPrompt()                              │
        └───────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌──────────────────────────────────────────────────────────┐
    │ Final Prompt:                                            │
    │                                                          │
    │ System: "You are a helpful Kubernetes assistant..."      │
    │                                                          │
    │ User: "                                                  │
    │ Context:                                                 │
    │ [Chunk 5]: Kubernetes networking uses CNI plugins...    │
    │ [Chunk 23]: The kube-proxy manages...                   │
    │ ... (all 5 chunks)                                      │
    │                                                          │
    │ Question: How does Kubernetes networking work?          │
    │ "                                                       │
    └──────────────────────────────────────────────────────────┘
                                    │
                                    ▼
        ┌───────────────────────────────────────────────────────┐
        │ STEP 5: CALL LLM                                      │
        │ llmService.generateAnswer(systemPrompt, userPrompt)  │
        └───────────────────────────────────────────────────────┘
                                    │
                    CALL GROQ API (External Service)
        ┌───────────────────────────┴───────────────────────────┐
        │                                                       │
        ▼                                                       ▼
    ┌──────────────────┐                            ┌──────────────────┐
    │ Request Body:    │                            │ Groq Server      │
    │ {                │                            │                  │
    │  model:          │                            │ Runs Mixtral,    │
    │  "mixtral..",    │                            │ Llama, DeepSeek  │
    │  messages: [     │──────────────────────────→ │                  │
    │   {role: "sys"}, │                            │ Generates token  │
    │   {role: "user"} │                            │ by token using   │
    │  ]               │                            │ transformers     │
    │ }                │                            │                  │
    └──────────────────┘                            │ Returns: {...}   │
                                                    └──────────────────┘
                                                            │
                                                            ▼
    ┌──────────────────────────────────────────────────────────┐
    │ Groq Response:                                           │
    │ {                                                        │
    │   "choices": [{                                          │
    │     "message": {                                         │
    │       "content": "Kubernetes networking is based on.." │
    │     }                                                    │
    │   }],                                                    │
    │   "usage": {                                             │
    │     "total_tokens": 342                                  │
    │   }                                                      │
    │ }                                                        │
    └──────────────────────────────────────────────────────────┘
                                    │
                                    ▼
        ┌───────────────────────────────────────────────────────┐
        │ STEP 6: SAVE TO DATABASE                              │
        │ (Chat History)                                        │
        └───────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌──────────────────────────────────────────────────────────┐
    │ INSERT INTO chat_messages:                               │
    │ - document_id: 5                                         │
    │ - user_message: "How does Kubernetes networking work?"  │
    │ - ai_response: "Kubernetes networking is based on..."   │
    │ - retrieved_chunks: [5, 23, 67, 45, 89]                 │
    │ - tokens_used: 342                                       │
    │ - created_at: now()                                      │
    └──────────────────────────────────────────────────────────┘
                                    │
                                    ▼
        ┌───────────────────────────────────────────────────────┐
        │ STEP 7: RETURN RESPONSE                               │
        │ Express sends to Frontend:                            │
        │ {                                                     │
        │   answer: "Kubernetes networking is based on...",    │
        │   retrievedChunks: 5,                                │
        │   tokensUsed: 342                                     │
        │ }                                                     │
        └───────────────────────────────────────────────────────┘
                                    │
                                    ▼
                            ┌──────────────────┐
                            │ FRONTEND         │
                            │ Display response │
                            │ in chat bubble   │
                            └──────────────────┘
                                    │
                                    ▼
                            USER SEES:
                            [AI]: "Kubernetes networking is 
                                   based on a flat network model..."
                            
                            Retrieved from 5 chunks
                            Tokens used: 342
```

---

## 3️⃣ DATA LAYER INTERACTIONS

### When a user uploads a PDF:

```
FILE STORAGE
./uploads/
└── 1704067200000-kubernetes.pdf  ← Stored on disk

DATABASE (PostgreSQL)
documents table:
├─ id: 5
├─ filename: "kubernetes.pdf"
├─ file_path: "./uploads/1704067200000-kubernetes.pdf"
├─ status: "completed"
└─ total_chunks: 90

chunks table: (90 rows)
├─ id: 501, document_id: 5, chunk_index: 0, text: "...", embedding: [0.23, ...]
├─ id: 502, document_id: 5, chunk_index: 1, text: "...", embedding: [0.34, ...]
├─ id: 503, document_id: 5, chunk_index: 2, text: "...", embedding: [0.45, ...]
└─ ...

chat_messages table:
├─ id: 1, document_id: 5, user_message: "How does RAG work?", ai_response: "..."
├─ id: 2, document_id: 5, user_message: "What about vectors?", ai_response: "..."
└─ id: 3, document_id: 5, user_message: "How does similarity search work?", ai_response: "..."

REDIS CACHE
├─ embedding:hash("How does RAG work?") → [0.23, 0.45, 0.67, ...]
├─ embedding:hash("What about vectors?") → [0.34, 0.56, 0.78, ...]
├─ session:user123 → { documentId: 5, lastQuery: "..." }
└─ doc:5:chunks → Cached frequently accessed chunks
```

---

## 4️⃣ ERROR HANDLING FLOW

```
USER REQUEST
    │
    ▼
VALIDATION FAILS (e.g., file too large)
    │
    ├─→ Catch in controller
    │   │
    │   ▼
    │   Return 400 Bad Request
    │   { error: "File too large" }
    │
    │
CLIENT REQUEST OK
    │
    ▼
EXTERNAL API FAILS (Groq API down)
    │
    ├─→ Catch in llmService
    │   │
    │   ├─→ Attempt retry (Bull queue)
    │   │
    │   └─→ If persists: Fallback to Together AI
    │
    │
DATABASE FAILS (connection lost)
    │
    ├─→ Catch in controller/service
    │   │
    │   ├─→ Log error
    │   │
    │   ├─→ Return 500 Server Error
    │   │
    │   └─→ Alert: (Sentry/DataDog)
    │
    │
VECTOR SEARCH TIMEOUT
    │
    ├─→ pgvector takes > 5 seconds
    │   │
    │   ├─→ Timeout handler catches
    │   │
    │   ├─→ Return cached results from Redis
    │   │
    │   └─→ Log slow query for optimization
```

---

## 5️⃣ ASYNC JOB FLOW (PDF Processing)

```
BULL QUEUE STATE MACHINE

[PENDING]
   │
   │ (Worker picks up job)
   ▼
[ACTIVE]  → (Processing PDF)
   │       - Extract text
   │       - Chunk text
   │       - Generate embeddings
   │       - Store in DB
   │
   ├─→ SUCCESS?
   │   │
   │   ├─→ YES
   │   │   │
   │   │   ▼
   │   │  [COMPLETED]
   │   │  (Document ready for chat)
   │   │
   │   └─→ NO
   │       │
   │       ▼
   │      [FAILED]
   │      (Retry logic kicks in)
   │
   └─→ RETRY ATTEMPT?
       │
       ├─→ YES (attempts < 3)
       │   │
       │   ▼
       │  [PENDING] ← (Re-queue)
       │
       └─→ NO (attempts ≥ 3)
           │
           ▼
          [FAILED]
          (Mark document as error in DB)
```

---

## 6️⃣ DEPLOYMENT & DATA PERSISTENCE

```
LOCAL DEVELOPMENT (docker-compose)
┌────────────────────────────────────────┐
│ Docker Network                         │
├────────────────────────────────────────┤
│ ┌─────────────────┐                   │
│ │ Backend         │                   │
│ │ :5000           │                   │
│ └────────┬────────┘                   │
│          │                            │
│  ┌───────┴───────────┬──────────┐    │
│  │                   │          │    │
│  ▼                   ▼          ▼    │
│┌─────────┐      ┌────────┐  ┌──────┐│
││PostgreSQL       │ Redis  │  │Files ││
││:5432           │ :6379  │  │      ││
│└─────────┘      └────────┘  └──────┘│
└────────────────────────────────────────┘

PRODUCTION (Railway/Render)
┌────────────────────────────────────────┐
│ Cloud Platform Network                 │
├────────────────────────────────────────┤
│ ┌──────────────────────────────────┐  │
│ │ Railway Database Service         │  │
│ │ PostgreSQL (managed, auto-backup)│  │
│ └──────────────────────────────────┘  │
│                                        │
│ ┌──────────────────────────────────┐  │
│ │ Railway Redis Service            │  │
│ │ Redis (managed, persistent)      │  │
│ └──────────────────────────────────┘  │
│                                        │
│ ┌──────────────────────────────────┐  │
│ │ Backend Service (Node.js)        │  │
│ │ Auto-scales with traffic         │  │
│ └──────────────────────────────────┘  │
│                                        │
│ ┌──────────────────────────────────┐  │
│ │ Frontend (Vercel/Netlify)        │  │
│ │ CDN, static hosting              │  │
│ └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

This comprehensive data flow shows exactly how each piece of data moves through your system!

# Project 1: AI Chat with Document RAG
## Detailed Implementation Plan

---

## 🎯 Project Overview

**Name:** `ai-rag-pdf-chat`

**Goal:** Build a web app where users can upload PDFs/text files and ask questions about them using AI.

**Example User Journey:**
1. User uploads "kubernetes-docs.pdf"
2. System chunks, embeds, and stores in vector DB
3. User asks: "How does Horizontal Pod Autoscaler work?"
4. System retrieves relevant chunks, feeds to LLM
5. LLM answers with context

**Why RAG matters:** Shows you understand retrieval, embeddings, and practical AI patterns (very hireable skill).

---

## 📊 Tech Stack (MERN + AI)

### Frontend
- **Framework:** React + Vite
- **UI Library:** Tailwind CSS
- **Components:** 
  - File upload drag-drop
  - Chat interface
  - Document list/management
- **State:** React hooks (or Zustand if complex)
- **API Client:** Axios or Fetch

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js (keep it simple initially)
- **Database:** PostgreSQL (with pgvector extension for embeddings)
- **Job Queue:** Bull + Redis (for async file processing)
- **File Storage:** Local filesystem (or S3 later)

### AI/ML
- **LLM API:** Groq (open-source models, free tier)
- **Embeddings:** sentence-transformers (Node.js binding) OR Hugging Face API
- **Vector DB:** pgvector in PostgreSQL (no extra service to manage)
- **Chunking:** Custom logic (simple sliding window)

### Infrastructure
- **Dev:** Docker Compose (Postgres + Redis)
- **Deployment:** Railway or Render (free tier)

---

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ File Upload  │  │ Chat Widget  │  │ Doc Manager  │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└────────────────────────┬──────────────────────────────────────┘
                         │ HTTP/REST
┌────────────────────────▼──────────────────────────────────────┐
│                     Express Backend                            │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ API Routes                                               │ │
│  │  POST /api/upload        → trigger processing           │ │
│  │  POST /api/chat          → retrieve + answer            │ │
│  │  GET  /api/documents     → list uploaded docs           │ │
│  │  DELETE /api/documents/:id → remove doc                 │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Services Layer                                           │ │
│  │  • PDFParser (extract text)                             │ │
│  │  • Chunking (split into overlapping chunks)             │ │
│  │  • EmbeddingService (call embedding API)                │ │
│  │  • RAGService (retrieve + prompt building)              │ │
│  │  • LLMService (call Groq API)                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Job Queue (Bull + Redis)                                │ │
│  │  • Process PDF chunks async                             │ │
│  │  • Generate embeddings in background                    │ │
│  │  • Store in vector DB                                   │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────┬───────────────────────────────────┬───────────────┘
             │                                   │
             ▼                                   ▼
    ┌──────────────────┐           ┌──────────────────────┐
    │   PostgreSQL     │           │   Groq API           │
    │  + pgvector      │           │  (Llama/DeepSeek)    │
    │                  │           │                      │
    │ • documents      │           │ - Fast inference     │
    │ • chunks         │           │ - Free tier          │
    │ • embeddings     │           │ - OSS models         │
    │ • chat_history   │           └──────────────────────┘
    └──────────────────┘
```

---

## 📁 Project Folder Structure

```
ai-rag-pdf-chat/
├── frontend/                    # React app
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatInterface.jsx
│   │   │   ├── FileUpload.jsx
│   │   │   ├── DocumentList.jsx
│   │   │   └── Sidebar.jsx
│   │   ├── pages/
│   │   │   └── Home.jsx
│   │   ├── api/
│   │   │   └── client.js           # axios instance
│   │   ├── hooks/
│   │   │   ├── useChat.js
│   │   │   └── useDocuments.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── package.json
│
├── backend/                     # Express app
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── uploadController.js
│   │   │   ├── chatController.js
│   │   │   └── documentController.js
│   │   ├── services/
│   │   │   ├── pdfParser.js        # extract text from PDF
│   │   │   ├── chunkingService.js  # split text into chunks
│   │   │   ├── embeddingService.js # generate embeddings
│   │   │   ├── ragService.js       # retrieve context
│   │   │   └── llmService.js       # call Groq API
│   │   ├── models/
│   │   │   ├── Document.js
│   │   │   ├── Chunk.js
│   │   │   └── ChatMessage.js
│   │   ├── middleware/
│   │   │   ├── errorHandler.js
│   │   │   └── auth.js             # basic auth later
│   │   ├── jobs/
│   │   │   └── processDocumentJob.js
│   │   ├── config/
│   │   │   ├── database.js
│   │   │   ├── queue.js
│   │   │   └── env.js
│   │   ├── routes/
│   │   │   ├── upload.js
│   │   │   ├── chat.js
│   │   │   └── documents.js
│   │   └── server.js
│   ├── .env.example
│   ├── docker-compose.yml
│   └── package.json
│
├── .gitignore
├── README.md
└── ARCHITECTURE.md
```

---

## 🔧 Step-by-Step Implementation Plan

### Phase 1: Setup & Database (Days 1-2)

#### 1.1 Initialize Backend
```bash
mkdir ai-rag-pdf-chat
cd ai-rag-pdf-chat

# Backend setup
mkdir backend && cd backend
npm init -y
npm install express dotenv cors axios pg bull redis
npm install --save-dev nodemon

# Create folder structure
mkdir src/{controllers,services,models,middleware,jobs,config,routes}
```

#### 1.2 PostgreSQL + pgvector Setup

Create `backend/docker-compose.yml`:
```yaml
version: '3.8'
services:
  postgres:
    image: pgvector/pgvector:pg15-latest
    environment:
      POSTGRES_DB: rag_chat
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

#### 1.3 Database Schema

Create `backend/src/config/database.js`:
```javascript
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Create tables
const initDB = async () => {
  const client = await pool.connect();
  try {
    // Enable pgvector
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');

    // Documents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255),
        filename VARCHAR(255) NOT NULL,
        file_path VARCHAR(500),
        file_size INT,
        mime_type VARCHAR(50),
        status VARCHAR(50) DEFAULT 'processing',
        total_chunks INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Chunks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chunks (
        id SERIAL PRIMARY KEY,
        document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index INT,
        text TEXT NOT NULL,
        embedding vector(384),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(document_id, chunk_index)
      )
    `);

    // Chat messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        user_message TEXT NOT NULL,
        ai_response TEXT,
        retrieved_chunks INT[] DEFAULT '{}',
        tokens_used INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_embedding 
      ON chunks USING ivfflat (embedding vector_cosine_ops)
    `);

    console.log('✅ Database initialized');
  } finally {
    client.release();
  }
};

module.exports = { pool, initDB };
```

#### 1.4 Environment Setup

Create `backend/.env.example`:
```env
# Database
DATABASE_URL=postgresql://dev:dev123@localhost:5432/rag_chat

# API Keys
GROQ_API_KEY=your_groq_api_key_here
HUGGINGFACE_API_KEY=your_huggingface_key_here

# Server
PORT=5000
NODE_ENV=development

# Redis
REDIS_URL=redis://localhost:6379

# File upload
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads
```

---

### Phase 2: Core Services (Days 3-4)

#### 2.1 PDF Parser Service

Create `backend/src/services/pdfParser.js`:
```javascript
const fs = require('fs');
const path = require('path');

// You can use: pdf-parse, pdfjs-dist, or even call external API
const PDFParse = require('pdf-parse');

class PDFParserService {
  async extractText(filePath) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await PDFParse(dataBuffer);
      
      return {
        text: data.text,
        pages: data.numpages,
        metadata: data.metadata
      };
    } catch (error) {
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }

  async extractTextFromFile(filePath, mimeType) {
    if (mimeType === 'application/pdf') {
      return this.extractText(filePath);
    } else if (mimeType === 'text/plain') {
      const text = fs.readFileSync(filePath, 'utf-8');
      return { text, pages: 1 };
    }
    throw new Error('Unsupported file type');
  }
}

module.exports = new PDFParserService();
```

#### 2.2 Chunking Service

Create `backend/src/services/chunkingService.js`:
```javascript
class ChunkingService {
  constructor(chunkSize = 500, overlap = 100) {
    this.chunkSize = chunkSize;
    this.overlap = overlap;
  }

  // Split text into overlapping chunks
  chunk(text) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks = [];
    let currentChunk = '';
    let charCount = 0;

    for (const sentence of sentences) {
      const sentenceLength = sentence.trim().length;

      if (charCount + sentenceLength > this.chunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        // Overlap: keep last part of previous chunk
        const overlapStart = Math.max(0, currentChunk.length - this.overlap);
        currentChunk = currentChunk.slice(overlapStart) + ' ' + sentence;
        charCount = currentChunk.length;
      } else {
        currentChunk += ' ' + sentence;
        charCount += sentenceLength;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(c => c.length > 50); // filter too-short chunks
  }

  // Adds metadata to chunks
  chunkWithMetadata(text, metadata = {}) {
    const chunks = this.chunk(text);
    return chunks.map((chunk, index) => ({
      text: chunk,
      index,
      ...metadata
    }));
  }
}

module.exports = new ChunkingService();
```

#### 2.3 Embedding Service

Create `backend/src/services/embeddingService.js`:
```javascript
const axios = require('axios');

class EmbeddingService {
  constructor() {
    // Option 1: Use Hugging Face API (free tier available)
    this.hfApiKey = process.env.HUGGINGFACE_API_KEY;
    this.hfModel = 'sentence-transformers/all-MiniLM-L6-v2';
    this.hfUrl = `https://api-inference.huggingface.co/pipeline/feature-extraction`;
  }

  async getEmbedding(text) {
    try {
      const response = await axios.post(
        this.hfUrl,
        { inputs: text },
        {
          headers: {
            Authorization: `Bearer ${this.hfApiKey}`,
          }
        }
      );

      // HF returns array of numbers
      return response.data[0] || response.data;
    } catch (error) {
      console.error('Embedding error:', error.message);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  // Batch embeddings for efficiency
  async getEmbeddings(texts) {
    try {
      const response = await axios.post(
        this.hfUrl,
        { inputs: texts },
        {
          headers: {
            Authorization: `Bearer ${this.hfApiKey}`,
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Batch embedding error:', error.message);
      throw error;
    }
  }
}

module.exports = new EmbeddingService();
```

**Alternative: Use local embeddings (if you want to avoid API calls)**
```javascript
// npm install @xenova/transformers
const { env, AutoTokenizer, AutoModel } = require('@xenova/transformers');

class LocalEmbeddingService {
  constructor() {
    this.model = null;
    this.tokenizer = null;
  }

  async initialize() {
    env.allowLocalModels = true;
    this.tokenizer = await AutoTokenizer.from_pretrained('Xenova/all-MiniLM-L6-v2');
    this.model = await AutoModel.from_pretrained('Xenova/all-MiniLM-L6-v2');
  }

  async getEmbedding(text) {
    const inputs = this.tokenizer(text, { padding: true, truncation: true });
    const { last_hidden_state } = await this.model(inputs);
    return Array.from(last_hidden_state.data);
  }
}
```

#### 2.4 RAG Service (Retrieval)

Create `backend/src/services/ragService.js`:
```javascript
const { pool } = require('../config/database');

class RAGService {
  async retrieveRelevantChunks(embedding, documentId, topK = 5) {
    const query = `
      SELECT 
        id,
        chunk_index,
        text,
        1 - (embedding <=> $1::vector) as similarity
      FROM chunks
      WHERE document_id = $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `;

    try {
      const result = await pool.query(query, [
        JSON.stringify(embedding),
        documentId,
        topK
      ]);

      return result.rows;
    } catch (error) {
      console.error('Retrieval error:', error);
      throw error;
    }
  }

  // Build context from retrieved chunks
  buildContext(chunks) {
    return chunks
      .map((chunk, i) => `[Chunk ${chunk.chunk_index}]:\n${chunk.text}`)
      .join('\n\n---\n\n');
  }

  // Build RAG prompt
  buildRAGPrompt(userQuery, context) {
    return `
You are a helpful assistant. Use the following context to answer the user's question.

Context:
${context}

User Question: ${userQuery}

Answer:`;
  }
}

module.exports = new RAGService();
```

#### 2.5 LLM Service (Groq)

Create `backend/src/services/llmService.js`:
```javascript
const axios = require('axios');

class LLMService {
  constructor() {
    this.apiKey = process.env.GROQ_API_KEY;
    this.baseUrl = 'https://api.groq.com/openai/v1';
    this.model = 'mixtral-8x7b-32768'; // or llama2-70b-4096
  }

  async generateAnswer(systemPrompt, userPrompt) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 1024,
          top_p: 1
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        answer: response.data.choices[0].message.content,
        tokens: response.data.usage.total_tokens,
        model: response.data.model
      };
    } catch (error) {
      console.error('LLM error:', error.response?.data || error.message);
      throw new Error(`LLM API failed: ${error.message}`);
    }
  }
}

module.exports = new LLMService();
```

---

### Phase 3: API Routes & Controllers (Days 5-6)

#### 3.1 Upload Controller

Create `backend/src/controllers/uploadController.js`:
```javascript
const { pool } = require('../config/database');
const uploadQueue = require('../config/queue');

exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { filename, path: filepath, size, mimetype } = req.file;

    // Save to database
    const result = await pool.query(
      `INSERT INTO documents (filename, file_path, file_size, mime_type, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, filename, status`,
      [filename, filepath, size, mimetype, 'processing']
    );

    const documentId = result.rows[0].id;

    // Queue job for async processing
    await uploadQueue.add(
      'process-document',
      { documentId, filePath: filepath },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
    );

    res.json({
      success: true,
      document: result.rows[0],
      message: 'File uploaded. Processing in background...'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
```

#### 3.2 Chat Controller

Create `backend/src/controllers/chatController.js`:
```javascript
const { pool } = require('../config/database');
const embeddingService = require('../services/embeddingService');
const ragService = require('../services/ragService');
const llmService = require('../services/llmService');

exports.chat = async (req, res) => {
  try {
    const { documentId, message } = req.body;

    if (!documentId || !message) {
      return res.status(400).json({ error: 'Missing documentId or message' });
    }

    // 1. Get embedding for user query
    const queryEmbedding = await embeddingService.getEmbedding(message);

    // 2. Retrieve relevant chunks
    const relevantChunks = await ragService.retrieveRelevantChunks(
      queryEmbedding,
      documentId,
      5 // top 5 chunks
    );

    if (relevantChunks.length === 0) {
      return res.json({
        answer: "Sorry, I couldn't find relevant information in the document.",
        chunkCount: 0
      });
    }

    // 3. Build context
    const context = ragService.buildContext(relevantChunks);

    // 4. Build RAG prompt
    const ragPrompt = ragService.buildRAGPrompt(message, context);

    // 5. Call LLM
    const llmResponse = await llmService.generateAnswer(
      'You are a helpful assistant answering questions based on provided context.',
      ragPrompt
    );

    // 6. Save to chat history
    await pool.query(
      `INSERT INTO chat_messages (document_id, user_message, ai_response, retrieved_chunks, tokens_used)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        documentId,
        message,
        llmResponse.answer,
        JSON.stringify(relevantChunks.map(c => c.id)),
        llmResponse.tokens
      ]
    );

    res.json({
      answer: llmResponse.answer,
      retrievedChunks: relevantChunks.length,
      tokensUsed: llmResponse.tokens
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
```

#### 3.3 Document Controller

Create `backend/src/controllers/documentController.js`:
```javascript
const { pool } = require('../config/database');

exports.listDocuments = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, filename, file_size, status, total_chunks, created_at 
       FROM documents 
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM documents WHERE id = $1', [id]);
    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getDocumentDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, filename, file_size, status, total_chunks, created_at 
       FROM documents 
       WHERE id = $1`,
      [id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
```

#### 3.4 Routes

Create `backend/src/routes/upload.js`:
```javascript
const express = require('express');
const multer = require('multer');
const path = require('path');
const uploadController = require('../controllers/uploadController');

const router = express.Router();

const storage = multer.diskStorage({
  destination: process.env.UPLOAD_DIR || './uploads',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'text/plain'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and TXT files allowed'));
    }
  }
});

router.post('/', upload.single('file'), uploadController.uploadDocument);

module.exports = router;
```

Create `backend/src/routes/chat.js`:
```javascript
const express = require('express');
const chatController = require('../controllers/chatController');

const router = express.Router();

router.post('/', chatController.chat);

module.exports = router;
```

Create `backend/src/routes/documents.js`:
```javascript
const express = require('express');
const documentController = require('../controllers/documentController');

const router = express.Router();

router.get('/', documentController.listDocuments);
router.get('/:id', documentController.getDocumentDetails);
router.delete('/:id', documentController.deleteDocument);

module.exports = router;
```

#### 3.5 Bull Queue Job

Create `backend/src/jobs/processDocumentJob.js`:
```javascript
const Queue = require('bull');
const { pool } = require('../config/database');
const pdfParser = require('../services/pdfParser');
const chunkingService = require('../services/chunkingService');
const embeddingService = require('../services/embeddingService');

const uploadQueue = new Queue('document-processing', process.env.REDIS_URL);

uploadQueue.process('process-document', async (job) => {
  try {
    const { documentId, filePath } = job.data;
    console.log(`Processing document ${documentId}...`);

    // 1. Extract text from PDF
    const { text } = await pdfParser.extractTextFromFile(filePath, 'application/pdf');

    // 2. Chunk the text
    const chunks = chunkingService.chunkWithMetadata(text);

    // 3. Generate embeddings and store chunks
    for (let i = 0; i < chunks.length; i += 10) {
      const batch = chunks.slice(i, i + 10);
      const textsToEmbed = batch.map(c => c.text);

      // Get embeddings
      const embeddings = await embeddingService.getEmbeddings(textsToEmbed);

      // Store in DB
      for (let j = 0; j < batch.length; j++) {
        await pool.query(
          `INSERT INTO chunks (document_id, chunk_index, text, embedding)
           VALUES ($1, $2, $3, $4)`,
          [documentId, batch[j].index, batch[j].text, JSON.stringify(embeddings[j])]
        );
      }

      job.progress((i / chunks.length) * 100);
    }

    // 4. Update document status
    await pool.query(
      `UPDATE documents SET status = $1, total_chunks = $2 WHERE id = $3`,
      ['completed', chunks.length, documentId]
    );

    console.log(`✅ Document ${documentId} processed with ${chunks.length} chunks`);
    return { success: true, chunks: chunks.length };
  } catch (error) {
    console.error('Job failed:', error);
    throw error;
  }
});

module.exports = uploadQueue;
```

#### 3.6 Main Server File

Create `backend/src/server.js`:
```javascript
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initDB } = require('./config/database');
const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chat');
const documentRoutes = require('./routes/documents');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/documents', documentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

// Start server
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();
```

---

### Phase 4: Frontend (Days 7-8)

#### 4.1 React Setup

```bash
npm create vite@latest frontend -- --template react
cd frontend
npm install axios zustand
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

#### 4.2 Components

Create `frontend/src/components/FileUpload.jsx`:
```jsx
import { useState } from 'react';
import axios from 'axios';

export default function FileUpload({ onUploadSuccess }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleFiles = async (files) => {
    const file = files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('http://localhost:5000/api/upload', formData);
      onUploadSuccess(response.data.document);
      alert('File uploaded! Processing in background...');
    } catch (error) {
      alert('Upload failed: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      className={`p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition
        ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
      `}
    >
      <p className="text-lg font-semibold">
        {uploading ? 'Uploading...' : 'Drop PDF or TXT files here'}
      </p>
      <input
        type="file"
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
        id="file-input"
        accept=".pdf,.txt"
      />
      <label htmlFor="file-input" className="text-blue-500 cursor-pointer">
        or click to select
      </label>
    </div>
  );
}
```

Create `frontend/src/components/ChatInterface.jsx`:
```jsx
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

export default function ChatInterface({ documentId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !documentId) return;

    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await axios.post('http://localhost:5000/api/chat', {
        documentId,
        message: input
      });

      const aiMessage = {
        role: 'assistant',
        content: response.data.answer,
        chunks: response.data.retrievedChunks
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: 'error', content: 'Error: ' + error.message }
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!documentId) {
    return <div className="p-4 text-gray-500">Select a document to start chatting</div>;
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs px-4 py-2 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : msg.role === 'error'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {msg.content}
              {msg.chunks && (
                <p className="text-xs mt-2 opacity-70">
                  (Retrieved from {msg.chunks} chunks)
                </p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 px-4 py-2 rounded-lg animate-pulse">
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask a question..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading || !documentId}
          />
          <button
            onClick={handleSend}
            disabled={loading || !documentId || !input.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

Create `frontend/src/components/DocumentList.jsx`:
```jsx
import { useState, useEffect } from 'react';
import axios from 'axios';

export default function DocumentList({ onSelectDocument, selectedId }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDocuments();
    const interval = setInterval(fetchDocuments, 2000); // poll for status updates
    return () => clearInterval(interval);
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/documents');
      setDocuments(response.data);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Delete this document?')) {
      try {
        await axios.delete(`http://localhost:5000/api/documents/${id}`);
        setDocuments((prev) => prev.filter((d) => d.id !== id));
      } catch (error) {
        alert('Failed to delete document');
      }
    }
  };

  return (
    <div className="h-full border-r border-gray-200 p-4 overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">Documents</h2>
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : documents.length === 0 ? (
        <p className="text-gray-500">No documents uploaded yet</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              onClick={() => onSelectDocument(doc.id)}
              className={`p-3 rounded-lg cursor-pointer transition ${
                selectedId === doc.id
                  ? 'bg-blue-100 border-l-4 border-blue-500'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <p className="font-semibold text-sm">{doc.filename}</p>
              <p className="text-xs text-gray-500">
                Status: <span className={doc.status === 'completed' ? 'text-green-600' : 'text-yellow-600'}>
                  {doc.status}
                </span>
              </p>
              {doc.total_chunks > 0 && (
                <p className="text-xs text-gray-500">{doc.total_chunks} chunks</p>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(doc.id);
                }}
                className="mt-2 text-xs text-red-500 hover:text-red-700"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

Create `frontend/src/App.jsx`:
```jsx
import { useState } from 'react';
import FileUpload from './components/FileUpload';
import DocumentList from './components/DocumentList';
import ChatInterface from './components/ChatInterface';

export default function App() {
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadSuccess = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar - Documents */}
      <div className="w-80 bg-white shadow">
        <DocumentList
          key={refreshKey}
          onSelectDocument={setSelectedDocId}
          selectedId={selectedDocId}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Upload Section */}
        <div className="p-6 bg-white border-b border-gray-200">
          <h1 className="text-3xl font-bold mb-4">AI PDF Chat</h1>
          <FileUpload onUploadSuccess={handleUploadSuccess} />
        </div>

        {/* Chat Section */}
        <div className="flex-1">
          <ChatInterface documentId={selectedDocId} />
        </div>
      </div>
    </div>
  );
}
```

---

## 📋 Backend Package.json

```json
{
  "name": "ai-rag-pdf-chat-backend",
  "version": "1.0.0",
  "type": "module",
  "main": "src/server.js",
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.0",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5",
    "multer": "^1.4.5",
    "bull": "^4.11.5",
    "redis": "^4.6.11",
    "pdf-parse": "^1.1.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

---

## 🚀 Deployment Checklist

### Before Shipping
- [ ] Environment variables set (API keys, DB URL)
- [ ] Database migrations tested
- [ ] File upload limits enforced
- [ ] Error handling for all API failures
- [ ] Rate limiting on chat endpoint
- [ ] Logging setup (Winston or similar)

### Deployment (Railway/Render)
1. Push to GitHub
2. Connect repo to Railway/Render
3. Set environment variables in dashboard
4. Deploy backend
5. Deploy frontend (build → static hosting)

---

## 📚 Medium Article Outline

**Title:** "Building a PDF Chatbot with RAG using Open-Source LLMs: Complete Guide"

1. **Introduction** (why RAG, why open-source)
2. **Architecture Diagram** (system design)
3. **Setting Up** (database, API keys)
4. **The RAG Pipeline** (chunking → embeddings → retrieval)
5. **Vector Search** (pgvector basics)
6. **Integrating Groq API** (open-source LLM inference)
7. **Frontend Chat UI** (React implementation)
8. **Lessons Learned** (what went wrong, optimizations)
9. **What's Next** (hybrid search, reranking, caching)

---

## 🎯 Success Metrics

- ✅ Upload PDF → RAG pipeline works
- ✅ Retrieve relevant chunks (top-5 by similarity)
- ✅ LLM generates contextual answers
- ✅ Chat history persisted
- ✅ Clean GitHub repo with README
- ✅ 2000+ word Medium article
- ✅ LinkedIn post with demo GIF

---

This is your complete implementation plan. Start with Phase 1 (database setup), then work sequentially. Each phase should take 1-2 days.

Ready to start coding? Let me know which part to dive deeper into!

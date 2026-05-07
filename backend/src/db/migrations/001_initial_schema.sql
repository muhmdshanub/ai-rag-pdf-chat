-- ============================================
-- Initial Schema for AI RAG PDF Chat
-- ============================================
-- This migration creates all base tables and enables pgvector.
-- It is idempotent (safe to run multiple times).

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ==================== DOCUMENTS ====================
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  total_chunks INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==================== CHUNKS ====================
CREATE TABLE IF NOT EXISTS chunks (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(384),            -- sentence-transformers/all-MiniLM-L6-v2 produces 384-dim vectors
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, chunk_index)
);

-- Index for fast vector similarity search
-- Note: IVFFlat index requires existing data to build.
-- For small datasets, a flat scan (no index) is fine.
-- Uncomment and run after inserting initial data:
-- CREATE INDEX IF NOT EXISTS idx_chunks_embedding
--   ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Index for fast document lookups
CREATE INDEX IF NOT EXISTS idx_chunks_document_id
  ON chunks(document_id);

-- ==================== CHAT MESSAGES ====================
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_message TEXT NOT NULL,
  ai_response TEXT,
  retrieved_chunk_ids INTEGER[] DEFAULT '{}',
  tokens_used INTEGER,
  model_used VARCHAR(100),
  response_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fetching chat history by document
CREATE INDEX IF NOT EXISTS idx_chat_messages_document_id
  ON chat_messages(document_id);

# 🔬 How It Works — Complete Implementation Guide

> This is the single source of truth for **what is built, how it works, and why**.
> Written from the actual source code — not from design intentions.
> Read this if you want to understand the system end-to-end.

---

## Table of Contents

1. [Big Picture — Two Flows](#1-big-picture--two-flows)
2. [Upload Flow — How a PDF Becomes Searchable](#2-upload-flow--how-a-pdf-becomes-searchable)
3. [Chat Flow — How a Question Gets Answered](#3-chat-flow--how-a-question-gets-answered)
4. [Every Service Explained](#4-every-service-explained)
   - [ChunkingService](#41-chunkingservice)
   - [EmbeddingService](#42-embeddingservice)
   - [QueryRewriterService](#43-queryrewriterservice)
   - [ChunkRepository — Hybrid Search](#44-chunkrepository--hybrid-search)
   - [RAGService — refineContext](#45-ragservice--refinecontext)
   - [RAGService — applyMMR](#46-ragservice--applymmr)
   - [RAGService — buildContext + buildPrompt](#47-ragservice--buildcontext--buildprompt)
   - [RerankerService](#48-rerankerservice)
   - [LLMService](#49-llmservice)
5. [Best Practices — Problem → Solution → Code](#5-best-practices--problem--solution--code)
6. [Caching Strategy](#6-caching-strategy)
7. [Error Handling & Graceful Degradation](#7-error-handling--graceful-degradation)
8. [Data Shapes — What Flows Between Steps](#8-data-shapes--what-flows-between-steps)

---

## 1. Big Picture — Two Flows

Every interaction in this system belongs to one of two flows:

```
UPLOAD FLOW (happens once per document, in background)
─────────────────────────────────────────────────────
PDF file → validate → extract text → chunk → embed → store in DB
                                                         │
                                             PostgreSQL chunks table
                                            (content + 384-dim vector
                                             + tsvector FTS index)

CHAT FLOW (happens on every question, in real time)
─────────────────────────────────────────────────────
User question → embed → rewrite → hybrid search → rerank
                                                      │
                                          refineContext → MMR
                                                      │
                                         buildContext → LLM → stream answer
```

These two flows share **zero code** with each other. The upload flow runs once, the chat flow runs many times. The database is the connection between them.

---

## 2. Upload Flow — How a PDF Becomes Searchable

**Orchestrated by:** `document.pipeline.js`  
**Triggered by:** HTTP `POST /api/upload` → BullMQ job → `process-document.job.js`

### Step 1 — File Validation (synchronous, during HTTP request)

The upload controller calls `documentPipeline.validateUpload(filePath)` before creating any DB record.

Two checks happen:
1. **File-level:** extension must be `.pdf`, size within limit
2. **PDF-level:** reads the raw file buffer and checks the PDF magic bytes (`%PDF-`) via `pdfParser.validatePDFBuffer(buffer)`

If either fails, the file is deleted from disk and the request returns an error. No DB record is created.

### Step 2 — Queue the Job (synchronous)

If validation passes, `documentPipeline.upload(file)` creates a DB record with `status = 'processing'` and immediately queues a BullMQ job:

```js
await uploadQueue.add('process-document', {
  documentId: document.id,
  filePath: file.path,
  mimeType: file.mimetype
}, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },  // 2s, 4s, 8s
});
```

The HTTP response returns instantly at this point with the document ID. The user does not wait for processing.

### Step 3 — Background Processing (async, in worker)

The BullMQ worker picks up the job and calls `documentPipeline.process(documentId, filePath)`. Progress is written to the DB at each step (0% → 10% → 30% → 50% → 70% → 90% → 100%).

**Step 3a — Read & Cache (10%)**

Reads the file from disk into a Buffer. Generates a cache key from the file's content hash. Checks Redis for a previously extracted result (TTL: 1 hour). This means if the same PDF is re-uploaded or reprocessed, text extraction is instant.

**Step 3b — Extract Text (30%)**

`pdfParser.extractFromBuffer(buffer)` uses the `pdf-parse` library to pull raw text from the PDF. Returns `{ text: string, pages: number }`. The result is saved to Redis (1-hour TTL) before proceeding.

> OCR note: If `pdf-parse` returns an empty string (scanned PDF), Tesseract.js is used as a fallback to perform OCR on each page image.

**Step 3c — Chunk Text (50%)**

`chunking.chunk(text, { chunkSize: 800, overlapSize: 200, minChunkSize: 50 })` splits the extracted text into overlapping segments. See [ChunkingService](#41-chunkingservice) for the full algorithm.

**Step 3d — Generate Embeddings (70%)**

For each chunk, the pipeline checks Redis for a cached embedding (keyed by the chunk text). Only chunks with cache misses are sent to HuggingFace in a single batch API call. New embeddings are cached with a 24-hour TTL before being used.

**Step 3e — Store in Database (90%)**

All chunks are written in a single PostgreSQL transaction (`BEGIN` / `COMMIT`). Each row stores:
- `content` — the raw text
- `embedding` — the 384-dimension vector (pgvector type)
- `fts_vector` — auto-generated by PostgreSQL `GENERATED ALWAYS AS (to_tsvector('english', content)) STORED`

**Step 3f — Mark Complete (100%)**

`documentRepository.updateChunkCount()` and `documentRepository.updateStatus('completed')` are called. The frontend polls `GET /api/documents` and transitions the UI from "Processing…" to "Ready to chat".

---

## 3. Chat Flow — How a Question Gets Answered

**Orchestrated by:** `chat.pipeline.js`  
**Triggered by:** HTTP `POST /api/chat` (non-streaming) or `GET /api/chat/stream` (SSE streaming)

Both `ask()` and `askStream()` run **identical Steps 1–4.5**. They diverge only at Step 5 when one calls `llm.generateAnswer()` and the other calls `llm.generateAnswerStream()`.

---

### Step 1 — Verify Document

```js
const document = await documentRepository.findReadyForChat(documentId);
if (!document) throw new NotFoundError(...);
```

Checks that the document exists AND has `status = 'completed'`. If the document is still processing, the user gets a clear error, not a bad retrieval result.

---

### Step 2 — Embed the Question

```js
const cacheKey = cache.generateStringKey(`query_embed_${message}`);
let queryEmbedding = await cache.get(CACHE_NAMESPACES.EMBEDDINGS, cacheKey);

if (!queryEmbedding) {
  const newEmbeddings = await embedding.getEmbeddings([message]);
  queryEmbedding = newEmbeddings[0];
  await cache.set(CACHE_NAMESPACES.EMBEDDINGS, cacheKey, queryEmbedding, 86400);
}
```

The question is converted to a 384-dimension float array using the HuggingFace `sentence-transformers/all-MiniLM-L6-v2` model. If this exact question was asked before, the cached vector is used instantly (Redis, 24-hour TTL). The embedding is used for **vector search** in Step 3.

> **Important:** The original question text (not the extracted keywords) is always used for embedding. This preserves full semantic meaning for the vector search path.

---

### Step 2.5 — Query Rewriting

```js
const ftsQuery = await queryRewriter.extractKeywords(message);
```

A fast LLM call (`llama-3.1-8b-instant`, temperature=0, max_tokens=50) strips the question down to only its critical keywords for use in the **FTS path** of hybrid search. See [QueryRewriterService](#43-queryrewriterservice) for why this matters.

---

### Step 3 — Hybrid Search (Wide Net)

```js
const similarChunks = await chunkRepository.findSimilar(
  ftsQuery,        // → FTS path
  queryEmbedding,  // → Vector path
  documentId,
  config.rag.recallK   // default: 30 candidates
);
```

A single SQL query runs both vector and keyword searches simultaneously and merges them. See [ChunkRepository — Hybrid Search](#44-chunkrepository--hybrid-search) for the full SQL.

`recallK = 30` is intentionally large — this is a "wide net" that catches everything possibly relevant. Aggressive filtering happens in the next steps.

---

### Step 3.5 — Cross-Encoder Re-ranking (optional)

```js
const rerankedChunks = await reranker.rerank(message, similarChunks);
```

If `RAG_RERANKER_ENABLED=true`, a HuggingFace cross-encoder model scores every `(question, chunk)` pair **together** (not independently). This gives more accurate relevance ordering than the bi-encoder vector search. Disabled by default to conserve API quota. See [RerankerService](#48-rerankerservice).

---

### Step 4 — Dynamic Refinement

```js
const refinedChunks = rag.refineContext(rerankedChunks, {
  minSimilarity: 0.25,    // hard floor
  maxContextLength: 12000 // ~3000 tokens
});
```

Three sequential filters:
1. **Hard threshold** — drops any chunk with similarity < 0.25
2. **Gap detection (elbow logic)** — if the similarity drops by more than 0.15 from one chunk to the next (after the top 3), the rest are cut
3. **Token budget** — stops adding chunks once accumulated content exceeds 12,000 characters

See [RAGService — refineContext](#45-ragservice--refinecontext) for the full logic.

---

### Step 4.5 — MMR Diversification

```js
const relevantChunks = rag.applyMMR(refinedChunks, { lambda: 0.7 });
```

Reorders and filters the refined chunks to reduce redundancy. Prevents the LLM from receiving 5 near-identical paragraphs. See [RAGService — applyMMR](#46-ragservice--applymmr).

---

### Step 5 — Build Context

```js
const context = rag.buildContext(relevantChunks);
```

Formats each chunk as:
```
[1]:
<chunk content here>

────────────────────────────────────────────────────────────────────────────────

[2]:
<chunk content here>
```

The `[N]` IDs are what the LLM references in citations like `"He worked at Urolime [2]."`.

---

### Step 6 — Build Prompt & Call LLM

```js
const { system, user } = rag.buildPrompt(message, context);
```

**System prompt** (fixed, from config):
```
You are a helpful AI assistant answering questions based strictly on the provided document context.

Guidelines:
1. Use ONLY information from the provided context.
2. If the context doesn't contain the answer, say "The provided context doesn't contain information about this."
3. When stating a fact, append the source citation number in brackets IMMEDIATELY after the fact.
4. NEVER use the words "chunk", "context", or "document" in your response. Answer naturally.
5. Be clear and concise. Do not make up information.
```

**User prompt** (dynamic):
```
Context from document:

[1]:
<chunk 1 content>
...

────────────────────────────────────────────────

Question: <user's question>

Instructions:
- Answer using the context above
- Reference chunk numbers if using specific information
```

If `context` is empty (no chunks passed filtering), the user prompt instead says:
```
Question: <user's question>
Note: No relevant context found in the document for this question.
```

This is why the LLM says "I don't know" gracefully instead of hallucinating.

---

### Step 7 — Save to History

```js
await chatMessageRepository.create({
  documentId,
  userMessage: message,
  aiResponse: fullAnswer,
  retrievedChunkIds: relevantChunks.map(c => c.id),
  tokensUsed,
  modelUsed: model,
  responseTimeMs,
});
```

The exact chunk IDs used for the answer are persisted. This enables future features like: "Why did it say that?" or RAGAS evaluation.

---

## 4. Every Service Explained

### 4.1 ChunkingService

**File:** `backend/src/services/chunking.service.js`  
**Type:** Pure logic — no I/O, no DB, no API calls  
**Config:** `CHUNKING_CHUNK_SIZE=800`, `CHUNKING_OVERLAP_SIZE=200`, `CHUNKING_MIN_CHUNK_SIZE=50`

**The problem it solves:**  
LLMs have a context window limit. A 50-page PDF cannot be sent to the LLM in one shot. It must be split into small, semantically coherent pieces that each fit in the context window.

**How it works (4 stages):**

**Stage 1 — Normalize**  
Collapses multiple blank lines into one, removes tabs, trims. This prevents whitespace-heavy PDFs from generating empty chunks.

**Stage 2 — Split by sentence boundaries**  
Uses a lookbehind regex `(?<=[.!?])\s+` to split on sentence endings. This keeps sentences whole — never splits mid-sentence.

**Stage 3 — Group sentences into chunks**  
Iterates through sentences, accumulating them into a chunk until the `chunkSize` limit (800 chars) would be exceeded. When the limit is hit:
- The current chunk is saved
- The last `overlapSize` (200) characters of that chunk are carried forward as the start of the next chunk

This **overlap** is the key design decision. If a relevant sentence lands at the boundary between two chunks, it appears in both — ensuring it's always retrievable.

**Stage 4 — Filter tiny chunks**  
Chunks shorter than `minChunkSize` (50 chars) are dropped. These are usually PDF header/footer artifacts like page numbers or section dividers.

**Output shape:**
```js
[
  {
    text: "He worked at Urolime Technologies as a TechOps Support Engineer...",
    index: 0,
    position: 0,
    statistics: { characters: 782, words: 134, sentences: 6 }
  },
  ...
]
```

---

### 4.2 EmbeddingService

**File:** `backend/src/services/embedding.service.js`  
**External call:** HuggingFace Inference API — `sentence-transformers/all-MiniLM-L6-v2`  
**Output:** 384-dimension float array per text

**What embeddings are:**  
A text embedding is a list of 384 numbers that represent the *meaning* of a sentence in a mathematical space. Two sentences that mean similar things will have vectors that are "close" to each other (high cosine similarity). Two sentences that mean different things will have vectors that are far apart.

This is what makes semantic search work — "Which in-memory data store did he use?" can retrieve a chunk that says "Redis was used for caching" even though there's no word overlap.

**Batch processing:**  
`getEmbeddings(texts: string[])` sends multiple texts in one API call and returns one vector per text. During document processing, all chunks are embedded in one batch to minimise API round trips.

---

### 4.3 QueryRewriterService

**File:** `backend/src/services/query-rewriter.service.js`  
**External call:** Groq API — `llama-3.1-8b-instant` (fastest, cheapest model)  
**Config:** `RAG_QUERY_REWRITER_ENABLED=true`, `RAG_QUERY_REWRITER_TIMEOUT_MS=2000`

**The problem it solves:**  
Full Text Search works by matching stemmed keywords. The question `"How many companies has he worked at and what are their names?"` contains the words `worked`, `companies`, `names` — all of which appear in almost every section of a resume. This causes FTS to artificially boost chunks that mention work in any context, not necessarily the employment section.

Without query rewriting, FTS introduces noise. With it, FTS becomes a precision tool.

**How it works:**

A system prompt instructs the LLM to act as a keyword extraction engine, not a conversational assistant:

```
Extract ONLY:
- Proper nouns (names of people, companies, places, products)
- Technical terms and acronyms (CGPA, RabbitMQ, PostgreSQL)
- Specific domain identifiers (B.Tech, TechOps, Packapeer)
Omit: all verbs, articles, prepositions, and common words.
If no specific keywords exist, return an empty string.
```

Examples:
| Question | Extracted Keywords |
|---|---|
| "What was his CGPA?" | `"CGPA"` |
| "What are the features of Vergno?" | `"Vergno"` |
| "How many companies did he work at?" | `""` (empty) |
| "Tell me about his role at Packapeer Academy" | `"Packapeer Academy"` |

**Fallback behaviour:**
- If the API call times out (2s limit via `Promise.race`), returns the original question
- If the API returns an error, returns the original question
- If keywords is empty string, returns the original question (so vector search still gets full context)
- Service is entirely non-blocking — the pipeline continues regardless of what happens here

---

### 4.4 ChunkRepository — Hybrid Search

**File:** `backend/src/repositories/chunk.repository.js`  
**Method:** `findSimilar(queryText, queryEmbedding, documentId, topK)`

This is the most important SQL query in the system. It runs **two searches in one query** and merges results:

```sql
WITH vector_search AS (
  -- Search by semantic meaning (cosine similarity via pgvector)
  SELECT id, chunk_index, content, embedding,
         1 - (embedding <=> $2::vector) AS similarity
  FROM chunks
  WHERE document_id = $3
  ORDER BY embedding <=> $2::vector   -- <=> is pgvector cosine distance operator
  LIMIT $4                             -- top 30 candidates
),
keyword_search AS (
  -- Search by exact keywords (PostgreSQL Full Text Search)
  SELECT id, chunk_index, content, embedding,
         0.8 AS similarity             -- synthetic fixed score
  FROM chunks
  WHERE document_id = $3
    AND plainto_tsquery('english', $1)::text != ''   -- guard: skip if no valid FTS query
    AND fts_vector @@ replace(
          plainto_tsquery('english', $1)::text,
          '&', '|'                     -- AND → OR: any keyword match is enough
        )::tsquery
  ORDER BY ts_rank(fts_vector, ...) DESC
  LIMIT 3                              -- max 3 FTS-only results
)
-- Merge both result sets, de-duplicate by taking the MAX score
SELECT id, chunk_index, content, embedding, MAX(similarity) AS similarity
FROM (
  SELECT * FROM vector_search
  UNION ALL
  SELECT * FROM keyword_search
) combined
GROUP BY id, chunk_index, content, embedding
ORDER BY similarity DESC
LIMIT $4
```

**Why AND → OR conversion:**  
`plainto_tsquery('english', 'Packapeer Academy')` produces `'packapeer' & 'academy'` (both words must match). Converting `&` to `|` means either word matches — important for multi-word proper nouns where one word might be on a different line.

**Why 0.8 synthetic score:**  
FTS chunks get a fixed score of 0.8. Vector search scores range from 0.0–1.0. A chunk found by both gets `MAX(1-cosine_distance, 0.8)`. This ensures FTS-only results are included but don't outrank semantically strong vector results.

**Why `embedding` is in the SELECT:**  
The `embedding` column is returned so `applyMMR()` can compute inter-chunk cosine similarity for deduplication in Step 4.5.

---

### 4.5 RAGService — refineContext

**File:** `backend/src/services/rag.service.js`  
**Method:** `refineContext(chunks, options)`  
**Config:** `RAG_MIN_SIMILARITY=0.25`, `RAG_MAX_CONTEXT_CHARS=12000`, `gapThreshold=0.15`

Takes the 30 candidates from hybrid search and applies three sequential filters, iterating chunk-by-chunk in order of descending similarity:

**Filter 1 — Hard Threshold**
```js
if (similarity < minSimilarity) break;   // minSimilarity = 0.25
```
Any chunk scoring below 0.25 (out of 1.0) is irrelevant. Stop immediately — everything after will also be below threshold since results are sorted by score.

**Filter 2 — Gap Detection (Elbow Logic)**
```js
if (i >= 3) {  // always keep at least top 3
  const gap = prevSimilarity - currentSimilarity;
  if (gap > gapThreshold) break;  // gapThreshold = 0.15
}
```
Dense documents often have a few highly relevant chunks and then a sudden drop in score. This detects that "elbow" — the point where relevance falls off a cliff — and stops there. The `i >= 3` guard ensures we always include at least 3 chunks even if they're close in score.

**Filter 3 — Token Budget**
```js
const estimate = chunk.content.length + 100; // content + formatting overhead
if (currentChars + estimate > maxChars) break;  // maxChars = 12000
```
Prevents context overflow. 12,000 characters ≈ 3,000 tokens — well within Groq's context window for all models.

---

### 4.6 RAGService — applyMMR

**File:** `backend/src/services/rag.service.js`  
**Method:** `applyMMR(chunks, options)`  
**Config:** `RAG_MMR_ENABLED=true`, `RAG_MMR_LAMBDA=0.7`

**The problem it solves:**  
Vector search is excellent at finding relevant chunks, but it may return 5 chunks that all say nearly the same thing (e.g., 5 different bullet points from the same "Experience" section). Sending 5 near-identical chunks to the LLM wastes context and can confuse it.

**The algorithm (Maximal Marginal Relevance):**

For each selection round, score every remaining candidate as:
```
MMR_score = λ × relevance_to_query − (1 − λ) × max_similarity_to_already_selected
```

Where:
- `relevance_to_query` = the chunk's similarity score from hybrid search (0–1)
- `max_similarity_to_already_selected` = the highest cosine similarity between this chunk and any already-selected chunk (computed in pure JS from the embedding vectors)
- `λ = 0.7` = 70% weight on relevance, 30% weight on diversity

The chunk with the highest MMR score is selected, then the process repeats with the remaining pool.

**Result:** The selected chunks are both relevant to the question AND diverse from each other.

**Fallback:** If chunks don't have embedding arrays (e.g., DB returned them as strings), MMR is skipped and the original order is returned unchanged.

---

### 4.7 RAGService — buildContext + buildPrompt

**`buildContext(chunks)`**  
Numbers each chunk with `[1]`, `[2]`, etc., and joins them with an 80-character separator line. These numbers become the citation anchors the LLM embeds into its answer.

**`buildPrompt(query, context)`**  
Constructs two strings:
- `system` — the fixed factual-only instructions (never changes per query)
- `user` — the dynamic combination of context + the user's question + inline instructions

If `context` is empty (no chunks survived filtering), the user prompt explicitly says "No relevant context found" — forcing the LLM into the "I don't know" path rather than generating from its training data.

---

### 4.8 RerankerService

**File:** `backend/src/services/reranker.service.js`  
**External call:** HuggingFace — `cross-encoder/ms-marco-MiniLM-L-6-v2`  
**Config:** `RAG_RERANKER_ENABLED=false` (off by default)

**The problem it solves:**  
The bi-encoder embeddings used in vector search embed the question and each chunk **separately** and then compare them. A cross-encoder reads the question and chunk **together** as one input, allowing it to understand the relationship between them directly. This is significantly more accurate but also significantly slower (one API call per chunk pair).

**How it works:**  
Takes the question and all chunks from Step 3, sends each `(question, chunk)` pair to the HuggingFace text-classification endpoint, gets a raw logit score back for each pair, normalizes via sigmoid to 0–1, then sorts chunks by this new score.

The `.similarity` field on each chunk is **replaced** with the normalized cross-encoder score — so `refineContext()` and `applyMMR()` in the next steps receive the better score transparently and need no changes.

**Why it's off by default:**  
Each chat request would make N HuggingFace API calls (one per candidate chunk). For `recallK=30`, that's 30 API calls per question. The free tier would exhaust quickly. Enable with `RAG_RERANKER_ENABLED=true` when you have sufficient quota.

---

### 4.9 LLMService

**File:** `backend/src/services/llm.service.js`  
**External call:** Groq API  
**Models:** `llama-3.3-70b-versatile` (default), configurable via `LLM_DEFAULT_MODEL`

Two methods:

**`generateAnswer(system, user, options)`**  
Sends a single chat completion request. Returns `{ answer, tokens, durationMs }`. Used by `ask()` (non-streaming).

**`generateAnswerStream(system, user, options)`**  
An async generator function. Requests streaming from Groq, yields each token string as it arrives. Used by `askStream()` — the chat controller writes each yielded token directly to the SSE (Server-Sent Events) HTTP response, giving the user the typewriter effect.

**LLM settings:**  
- Temperature: 0.1 (near-deterministic, factual answers)
- Max tokens: 1024 (enough for detailed answers, prevents runaway responses)
- Model: llama-3.3-70b-versatile — large enough for complex multi-chunk synthesis, fast enough on Groq infrastructure

---

## 5. Best Practices — Problem → Solution → Code

### ① Sentence-Aware Chunking
- **Problem:** Naive character-split chunking breaks sentences mid-word, creating incoherent chunks that embed poorly
- **Solution:** Split on sentence endings (`[.!?]`), then group whole sentences into chunks
- **Where:** `chunking.service.js → _splitBySentences() → _groupSentencesIntoChunks()`

### ② Chunk Overlap
- **Problem:** A key sentence at a chunk boundary would only exist in one chunk — if the wrong chunk is retrieved, the information is missed
- **Solution:** Last 200 chars of each chunk are carried over as the start of the next chunk
- **Where:** `chunking.service.js → _groupSentencesIntoChunks()` — `overlapText = currentChunkText.slice(-overlapSize)`

### ③ Embedding Cache (Upload Time)
- **Problem:** Re-uploading a document or reprocessing after a failure would re-call HuggingFace API for every chunk, wasting quota and time
- **Solution:** Each chunk's embedding is cached in Redis keyed by the chunk text (24h TTL). Only cache misses hit the API
- **Where:** `document.pipeline.js` — Steps 3d, per-chunk Redis get/set before batch API call

### ④ Embedding Cache (Chat Time)
- **Problem:** Users often ask similar questions. Re-embedding the same question on every request wastes API calls
- **Solution:** Query embeddings are cached in Redis keyed by the question text (24h TTL)
- **Where:** `chat.pipeline.js` — Step 2, `CACHE_NAMESPACES.EMBEDDINGS`

### ⑤ PDF Extraction Cache
- **Problem:** If a document reprocessing is triggered (job retry after failure), parsing the PDF again is wasteful
- **Solution:** Extracted text is cached in Redis keyed by the file's content hash (1h TTL)
- **Where:** `document.pipeline.js` — Steps 3a, 3b — `CACHE_NAMESPACES.PDF_EXTRACTION`

### ⑥ Full Text Search (FTS)
- **Problem:** Vector search is excellent for semantic queries but misses exact-match queries ("What is his email address?"). The email address might have low cosine similarity to the question.
- **Solution:** PostgreSQL `tsvector` column with GIN index. Exact-keyword FTS runs in parallel with vector search.
- **Where:** `002_add_fts_hybrid_search.sql` — GIN index; `chunk.repository.js` — `keyword_search` CTE

### ⑦ Hybrid Search with Synthetic Scoring
- **Problem:** Vector and FTS results are in different score spaces (cosine similarity vs ts_rank). They can't be directly compared or merged.
- **Solution:** FTS results get a fixed synthetic score of 0.8. Both result sets are UNION'd and de-duplicated with `MAX(similarity)`. A chunk found by both gets its vector score if it's > 0.8, or 0.8 if FTS found it but vector didn't.
- **Where:** `chunk.repository.js → findSimilar()` — full SQL CTE

### ⑧ Query Rewriting
- **Problem:** Questions like "How many companies did he work at?" contain only generic verbs and nouns that match every chunk via FTS, creating noise and false boosts.
- **Solution:** A fast LLM call extracts only proper nouns and technical terms for FTS. Generic questions return empty keywords, which causes the original question to be used as FTS input, preserving vector-search quality.
- **Where:** `query-rewriter.service.js`, called at Step 2.5 in `chat.pipeline.js`

### ⑨ Wide-Net Recall (recallK=30)
- **Problem:** If you only retrieve 5 chunks, the best chunks might not be in the top 5 for the initial retrieval. Aggressive filtering later requires a large initial pool.
- **Solution:** Retrieve 30 candidates. Aggressive filtering in Steps 4 and 4.5 reduces to the truly relevant subset.
- **Where:** `config/index.js → RAG_RECALL_K=30`; `chat.pipeline.js → findSimilar(..., recallK)`

### ⑩ Hard Similarity Threshold
- **Problem:** Low-quality chunks with similarity 0.1 or 0.15 are essentially unrelated to the question. Including them adds noise.
- **Solution:** Hard floor at 0.25. Anything below is unconditionally dropped.
- **Where:** `rag.service.js → refineContext()` — Filter 1

### ⑪ Gap Detection (Elbow Logic)
- **Problem:** Even after the threshold filter, you might include marginally relevant chunks if they all sit just above 0.25. A sudden drop in score indicates "the rest are irrelevant."
- **Solution:** If similarity drops by more than 0.15 from one chunk to the next (after the guaranteed top 3), stop including more chunks.
- **Where:** `rag.service.js → refineContext()` — Filter 2

### ⑫ Token Budgeting
- **Problem:** If many chunks pass filtering (long document, broad question), context could overflow the LLM's window.
- **Solution:** Hard stop at 12,000 characters (~3,000 tokens), well within Groq's context limit for all supported models.
- **Where:** `rag.service.js → refineContext()` — Filter 3

### ⑬ MMR Diversification
- **Problem:** Vector search may return 5 nearly identical chunks (e.g., multiple bullet points from the same experience section). The LLM receives redundant context, wasting its window.
- **Solution:** MMR iteratively selects the next chunk that maximises relevance minus similarity to already-selected chunks (λ=0.7).
- **Where:** `rag.service.js → applyMMR()`, called at Step 4.5 in `chat.pipeline.js`

### ⑭ Source Citations
- **Problem:** The user has no way to verify an answer. Trust in AI answers requires source attribution.
- **Solution:** Context is formatted with `[1]:`, `[2]:` IDs. The system prompt instructs the LLM to cite inline, immediately after each fact.
- **Where:** `rag.service.js → buildContext()` and `buildPrompt()`

### ⑮ Hallucination Prevention
- **Problem:** If the LLM doesn't receive relevant context, it may generate plausible-sounding but fabricated answers from its training data.
- **Solution:** When `context` is empty, the user prompt explicitly says "No relevant context found." The system prompt forbids answering outside the context. The LLM is forced to say "I don't know."
- **Where:** `rag.service.js → buildPrompt()` — the else branch; system prompt guidelines 1 and 2

---

## 6. Caching Strategy

| Cache Key | Namespace | TTL | What's Stored |
|---|---|---|---|
| MD5 of chunk text | `EMBEDDINGS` | 24 hours | 384-dim float array |
| MD5 of question text | `EMBEDDINGS` | 24 hours | 384-dim float array |
| SHA256 of file contents | `PDF_EXTRACTION` | 1 hour | `{ text, pages }` |

All caching uses Redis. Cache namespaces prevent key collisions between different data types. The embedding cache is shared between upload-time (chunk embeddings) and chat-time (query embeddings) because the same model generates both.

---

## 7. Error Handling & Graceful Degradation

Every new feature introduced has a **graceful fallback** — failure of one step never crashes the pipeline:

| Service | What Happens on Failure |
|---|---|
| **QueryRewriterService** | Returns original question. Chat continues normally. Logged as `WARN`. |
| **RerankerService** | Returns chunks in original retrieval order. Chat continues normally. Logged as `WARN`. |
| **applyMMR** | Returns chunks in refined order (pre-MMR). Chat continues normally. Logged as `WARN`. |
| **Redis cache** | Falls through to API call. Chat is slower but correct. Logged as `WARN`. |
| **BullMQ job** | Auto-retries 3 times with exponential backoff (2s, 4s, 8s). Document marked `failed` after all attempts. |
| **HuggingFace API** | `EmbeddingService` throws — caught by pipeline. Document marked `failed` or chat returns error. |
| **Groq API** | `LLMService` throws — caught by pipeline. User receives error response. |

---

## 8. Data Shapes — What Flows Between Steps

**Question embedding (Step 2 → Step 3):**
```js
queryEmbedding = [0.0234, -0.1567, 0.0891, ...]  // 384 floats
```

**FTS query string (Step 2.5 → Step 3):**
```js
ftsQuery = "Packapeer Academy"       // extracted keywords
// or
ftsQuery = "How many companies..."   // original question (fallback)
```

**Chunk from findSimilar (Step 3 output):**
```js
{
  id: 42,
  chunk_index: 3,
  content: "He worked at Packapeer Academy Pvt. Ltd. as a Software Engineer...",
  embedding: [0.0123, -0.0456, ...],  // 384 floats — needed by applyMMR
  similarity: "0.8723"                // string from PostgreSQL MAX()
}
```

**Chunk after refineContext + applyMMR (Step 4.5 output → Step 5):**
Same shape as above. Only the set and order have changed. No fields are added or removed.

**Context string (Step 5 output → Step 6):**
```
[1]:
He worked at Packapeer Academy Pvt. Ltd. as a Software Engineer...

────────────────────────────────────────────────────────────────────────────────

[2]:
At Urolime Technologies, his job title was TechOps Support Engineer...
```

**LLM prompt (Step 6 input):**
```js
system: "You are a helpful AI assistant..."  // fixed
user:   "Context from document:\n\n[1]:\n...\n\nQuestion: What companies..."
```

**Final answer (Step 6 output):**
```
He worked at Packapeer Academy [1] as a Software Engineer and at
Urolime Technologies [2] as a TechOps Support Engineer.
```

# 🧪 RAG System — Capabilities & Limitations

> Last updated after comprehensive testing on 09 Jun 2026.
> Tested against two documents: a dense resume PDF and a narrative space exploration PDF.

---

## ✅ What Works — Fully Supported

### Question Types

| Type | Description | Example | Status |
|---|---|---|---|
| **Direct** | Ask for a specific fact that is explicitly stated in the document | *"What is his email address?"* | ✅ Works |
| **Indirect / Semantic** | Ask using different words — system infers meaning | *"Which in-memory data store did he use for caching?"* → Redis | ✅ Works |
| **Clubbed / Multi-part** | Ask two or more things in one question | *"What are the features of Vergno and what powered it?"* | ✅ Works |
| **Acronym / Exact Keyword** | Ask using specific technical terms, acronyms, or proper names | *"What was his CGPA?"*, *"Tell me about RabbitMQ usage"* | ✅ Works |
| **Contextual / Descriptive** | Ask for architecture, explanations, or summaries of sections | *"Describe the architecture of Teams Meet Manager"* | ✅ Works |
| **Negative / Out-of-scope** | Ask about something not in the document | *"What is his LinkedIn URL?"* | ✅ Gracefully says "I don't know" — no hallucination |
| **Narrative / Story** | Ask about narrative documents like articles, reports, stories | *"When did Voyager 1 enter interstellar space?"* | ✅ Works |

---

### Document Types

| Document Type | Description | Status |
|---|---|---|
| **Narrative PDFs** | Articles, reports, essays, research papers with flowing paragraphs | ✅ Excellent |
| **Technical PDFs** | Documentation, API specs, architecture docs | ✅ Excellent |
| **Dense Bullet-Point PDFs** | Resumes, CVs, structured lists | ✅ Good (with Hybrid Search + Query Rewriting) |
| **Multi-page PDFs** | Any PDF up to 100MB | ✅ Works |
| **Scanned PDFs** | Scanned images converted to text via OCR (Tesseract) | ✅ Works (quality depends on scan quality) |

---

### Features

| Feature | Description | Status |
|---|---|---|
| **Streaming responses** | Tokens stream to the user in real time | ✅ Works |
| **Source citations** | Every fact is annotated with `[1]`, `[2]` references | ✅ Works |
| **Semantic search** | Finds relevant content even with different wording | ✅ Works |
| **Keyword search (FTS)** | Exact keyword matching via PostgreSQL Full Text Search | ✅ Works |
| **Hybrid search** | Vector + FTS combined with Synthetic Scoring | ✅ Works |
| **Query Rewriting** | Extracts critical keywords before FTS to reduce noise | ✅ Works |
| **MMR Diversification** | Avoids sending near-duplicate chunks to LLM | ✅ Works |
| **Relevance filtering** | Drops low-quality chunks below similarity threshold | ✅ Works |
| **Hallucination prevention** | LLM says "I don't know" instead of making things up | ✅ Works |
| **Embedding cache** | Query embeddings cached in Redis for 24h | ✅ Works |
| **PDF extraction cache** | Extracted text cached in Redis for 1 hour | ✅ Works |
| **Background processing** | Upload is instant; chunking/embedding runs in background | ✅ Works |
| **Progress tracking** | Upload progress visible (0–100%) | ✅ Works |
| **Multiple documents** | Upload and chat with multiple independent PDFs | ✅ Works |
| **Re-ranking** | Cross-encoder re-ranking via HuggingFace | ⚙️ Implemented, disabled by default (`RAG_RERANKER_ENABLED=true` to enable) |

---

## ❌ What Does NOT Work — Known Limitations

### Question Types That Fail

| Type | Description | Example | Reason |
|---|---|---|---|
| **Aggregation / Multi-hop** | Questions that require reading multiple unrelated chunks and counting or listing them | *"How many companies has he worked at?"* | Vector search finds the *most similar* chunk, not *all relevant* chunks. No anchor keyword exists to pull multiple separate chunks simultaneously. |
| **Cross-document** | Questions that span across two different uploaded PDFs | *"Compare document A and document B"* | Each chat session is scoped to a single `documentId`. No cross-document retrieval is implemented. |
| **Calculation / Arithmetic** | Questions requiring the LLM to calculate something from numbers in the document | *"What is his total months of experience?"* | The LLM can read dates but is not a calculator. It may approximate or refuse. |
| **Chronological ordering** | Questions requiring putting events in time order across different chunks | *"List all his jobs from oldest to newest"* | The retriever fetches by relevance, not by page/position order. Chunk ordering is not preserved in retrieval. |
| **Table / Visual data extraction** | Questions about data in PDF tables, charts, or images | *"What value is in row 3 column 2 of the table?"* | PDF tables are extracted as raw text which may lose structure. Scanned tables require OCR which may distort alignment. |

---

### System Limitations

| Limitation | Description | Workaround |
|---|---|---|
| **Single document per chat** | Each conversation is tied to exactly one document | Upload the document you want to query, then start chatting |
| **No conversation memory across sessions** | Closing the browser and returning starts a fresh context | Not applicable for the current use case (document QA, not chatbot) |
| **Chunking of new documents only** | Changing `CHUNKING_CHUNK_SIZE` only affects newly uploaded documents. Existing documents use their original chunking. | Re-upload the document to use new chunking settings |
| **Rate limiting (Groq free tier)** | Groq's free developer plan limits requests per minute. Rapid back-to-back questions may temporarily fail. | Wait a few seconds and retry. Upgrade to a paid plan for production use. |
| **Aggregation questions** | Questions like "how many X" or "list all Y" across multiple chunks may fail | Ask about specific items directly: *"Tell me about his experience at Urolime"* then *"What about Packapeer?"* |
| **Re-ranker is opt-in** | The cross-encoder re-ranker is disabled by default to conserve HuggingFace API quota | Set `RAG_RERANKER_ENABLED=true` in `.env` to enable |

---

## 🔄 Workarounds for Aggregation Questions

When a direct aggregation question fails (e.g., *"How many companies has he worked at?"*), use conversational follow-ups:

| Instead of... | Try... |
|---|---|
| *"How many companies has he worked at and what are their names?"* | *"Tell me about his experience at Urolime"* → then *"What other companies did he work at?"* |
| *"List all his skills"* | *"What are his backend skills?"* → *"What about cloud/devops skills?"* |
| *"What are all the projects he has done?"* | *"Tell me about the Teams Meet Manager project"* → *"What about the Vergno project?"* |

---

## 📈 Feature Roadmap (Planned)

These features would address the remaining limitations:

| Feature | Would Fix |
|---|---|
| **Sub-Query Decomposition** | Aggregation / multi-hop questions |
| **Contextual compression** | Retrieving only the most relevant sentence within a chunk |
| **Parent-child chunking** | Retrieve small chunks, send large parent context to LLM |
| **Multi-document context** | Cross-document comparison questions |
| **Evaluation pipeline (RAGAS)** | Automated retrieval quality scoring |
| **User feedback loop** | Thumbs up/down improving future retrieval |

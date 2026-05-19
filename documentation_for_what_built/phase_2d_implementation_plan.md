# Phase 2d Implementation Plan: RAG Retrieval Service

## ⚠️ Architectural Correction
The provided `PHASE_2D_IMPLEMENTATION.md` suggests putting the orchestration logic (embedding the query, fetching from the DB, building the context) inside the `RAGService`. 

**This violates our strict `CODING_GUIDELINES.md`:**
> *Services (Layer 4) MUST NOT call other Services (prevents "Service Spaghetti"). They MUST have zero knowledge of the orchestration flow.*

If `RAGService` calls `EmbeddingService` and `ChunkRepository`, it becomes a Pipeline masquerading as a Service. 

Instead, the **`ChatPipeline`** will remain the orchestrator, and the **`RAGService`** will become a pure, stateless "Specialist" that handles the complex logic of similarity filtering, context formatting, and prompt engineering.

---

## 📋 Implementation Steps

### Step 1: Purify `RAGService` (The Specialist)
**File:** `backend/src/services/rag.service.js`
We will rewrite `rag.service.js` to remove any database or external service concepts. It will contain pure business logic:
1. `filterChunks(chunks, minSimilarity)`: Filters out retrieved chunks that do not meet a minimum semantic similarity threshold.
2. `buildContext(chunks, maxTokens)`: Formats the chunks into a structured context string (e.g., `[Chunk 1 | Similarity: 0.85]: ...`), intelligently truncating if the context exceeds LLM token limits.
3. `buildPrompt(question, context, options)`: Constructs the highly-engineered system and user prompts to instruct the LLM to answer *only* using the context.

### Step 2: Enhance `ChatPipeline` (The Orchestrator)
**File:** `backend/src/pipelines/chat.pipeline.js`
We will upgrade the existing `ask()` method to orchestrate the new flow robustly:
1. Validate document exists and is ready (`documentRepository.findReadyForChat`).
2. **[NEW]** Check `CacheService` to see if the user's exact question has already been embedded.
3. Embed the question via `EmbeddingService`.
4. Retrieve the top 5-10 chunks via `ChunkRepository.findSimilar`.
5. **[NEW]** Use `RAGService.filterChunks` to discard low-quality matches.
6. Use `RAGService.buildContext` to format the context.
7. Use `RAGService.buildPrompt` to finalize the LLM input.

### Step 3: Implement Unit Tests
**File:** `backend/src/services/rag.service.test.js`
Because `RAGService` will be 100% pure (no I/O, no DB), testing will be incredibly fast and simple. We will add a comprehensive Jest test suite to verify the prompt engineering, chunk formatting, and threshold filtering logic.

---

## ✅ Expected Outcome
By keeping the orchestration in the `ChatPipeline` and the specific formatting logic in the `RAGService`, we perfectly adhere to the enterprise guidelines:
- **Clean Boundaries:** Services don't talk to Services.
- **Easy Testing:** The RAG logic can be tested without mocking databases.
- **Fail-Fast:** The Pipeline maintains control over error handling and caching.

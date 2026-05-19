# 🎯 Implementation Plan: "Perfect RAG" (Token-Budgeted Dynamic Retrieval)

This plan upgrades our standard RAG system to an enterprise-grade **Multi-Stage Retrieval** engine. The goal is to maximize accuracy (Recall) while minimizing token costs and LLM confusion (Precision).

---

## 1. Core Architectural Concepts

### A. The "Wide-Net" Fetch (Recall)
Instead of asking the database for exactly 5 chunks, we fetch a larger buffer (e.g., **top 30**). This ensures that if a document contains 12 highly relevant paragraphs, we don't accidentally cut off 7 of them.

### B. The "Semantic Elbow" Cutoff (Precision)
We will implement an algorithm to detect the "Relevance Gap." 
*   **Scenario 1:** Chunks 1-10 all have ~0.95 similarity. We keep all 10.
*   **Scenario 2:** Chunk 1 has 0.95, Chunk 2 has 0.50. We stop at Chunk 1, because the rest is likely "noise" that would confuse the LLM.

### C. Token-Aware Packing (Efficiency)
We define a **Context Token Budget** (e.g., 4,000 tokens). We add high-quality chunks one-by-one until:
1.  We run out of "Super Matches" (High similarity).
2.  **OR** we hit our Token Budget.
This ensures we never waste money on irrelevant data and never break the LLM's context window.

---

## 2. Implementation Steps

### Phase 1: Configuration & Infrastructure
1.  **Update `config/index.js`:**
    *   `RAG_RECALL_K: 30` (How many candidates to fetch from DB).
    *   `RAG_MIN_SIMILARITY: 0.4` (The "Hard Floor" threshold).
    *   `RAG_MAX_CONTEXT_TOKENS: 4000` (The "Safety Budget").
2.  **Update `ChunkRepository`:**
    *   Ensure `findSimilar` can accept a dynamic `limit` parameter.

### Phase 2: RAGService Intelligence (The Specialist)
We will add a new method `refineContext(chunks, options)` to `rag.service.js`:
1.  **Hard Filtering:** Remove any chunk below `RAG_MIN_SIMILARITY`.
2.  **Gap Detection:** Loop through sorted chunks and find the first significant drop in similarity (e.g., a drop of > 0.15 between two consecutive chunks).
3.  **Budget Packing:** Use a lightweight token estimation (or character count) to pack the best chunks into a final context string.

### Phase 3: Pipeline Orchestration (The Orchestrator)
Update `ChatPipeline.ask()`:
1.  Fetch `RAG_RECALL_K` (30) chunks from `ChunkRepository`.
2.  Pass them to `RAGService.refineContext()`.
3.  Proceed with the refined, high-quality, token-efficient context.

---

## 3. Why this is "Perfect"
*   **Zero Information Loss:** It captures large spans of relevant text.
*   **Zero Noise:** it cuts off garbage data dynamically.
*   **Predictable Costs:** It never exceeds the token budget.
*   **High Speed:** Retrieval happens in one fast SQL query; refinement is pure in-memory math.

---

## 4. Success Metrics
*   **Token Savings:** Reduced average prompt size for simple queries.
*   **Accuracy:** Ability to answer questions that require info from 6+ different parts of the PDF.
*   **Robustness:** No "Hallucination" from irrelevant noise chunks.

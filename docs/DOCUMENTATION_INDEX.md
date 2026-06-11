# 📚 Documentation Index

Complete guide to all documentation in this project. Read in the order below for best understanding.

---

## 🗺️ Reading Order

### 1. [HOW_IT_WORKS.md](HOW_IT_WORKS.md) — *The Definitive Implementation Guide*
> **Start here if you want to understand the system deeply.**

Covers every service and feature written directly from the actual source code:
- Both flows end-to-end: Upload Pipeline (7 steps) and Chat Pipeline (7 steps)
- Every service explained: ChunkingService, EmbeddingService, QueryRewriterService, RAGService (refineContext, applyMMR), RerankerService, LLMService
- All 15 RAG best practices: problem → solution → exact file and function
- Caching strategy (what's cached, where, TTL)
- Error handling and graceful degradation behaviour
- Exact data shapes flowing between each pipeline step
- System architecture diagram

---

### 2. [LOCAL_SETUP.md](LOCAL_SETUP.md) — *How to Run It Locally*
> **Read this to get the project running on your machine.**

- Prerequisites (Node.js 18+, Docker Desktop)
- How to create a free Groq account and get an API key
- How to create a free HuggingFace account and get an API key
- Step-by-step setup (infrastructure → env → migrations → backend → frontend)
- Full `.env` template with every variable explained
- Useful commands (connect to DB, flush Redis, reset everything)
- Troubleshooting (10 most common errors and fixes)
- Port map for all services

---

### 3. [CAPABILITIES_AND_LIMITATIONS.md](CAPABILITIES_AND_LIMITATIONS.md) — *What Works and What Doesn't*
> **Read this before testing or demoing the system.**

- All supported question types with examples (Direct, Indirect, Semantic, Negative, Multi-part…)
- All supported document types (Narrative, Technical, Resume/CV, Dense Bullet-Point…)
- Full feature status table (16 features with ✅ / ❌ / ⚙️)
- Known limitations with root-cause explanations
- Workarounds for each limitation
- Feature roadmap (what would fix each limitation)

---

### 4. [ARCHITECTURE_CHEAT_SHEET.md](ARCHITECTURE_CHEAT_SHEET.md) — *Quick Reference*
> **Keep this open while working on the codebase.**

- 8-layer stack at a glance
- Updated 7-step chat pipeline flow
- Database schema (all columns including `fts_vector`)
- Technology matrix (what's used and why)
- Key design principles (Hybrid Search, MMR, Query Rewriting, Graceful Degradation)
- What's built vs what's next
- Success metrics

---

### 5. [ARCHITECTURE_SUMMARY.md](ARCHITECTURE_SUMMARY.md) — *System Overview*
> **High-level understanding of the complete architecture.**

- Layer-by-layer breakdown (all 8 layers)
- Complete Upload and Chat flow diagrams
- Database design with example data
- Service dependency map
- Performance targets
- Security considerations
- What you've learned from building this

---

### 6. [DATA_FLOW_DIAGRAMS.md](DATA_FLOW_DIAGRAMS.md) — *Visual Flow Reference*
> **For visual learners — ASCII diagrams of every flow.**

- Detailed upload flow diagram
- Detailed chat flow diagram
- Error handling flows
- State machine diagrams
- Deployment flow

---

### 7. [CODING_GUIDELINES.md](CODING_GUIDELINES.md) — *How to Write Code for This Project*
> **Read before contributing or extending the codebase.**

- Folder structure conventions
- Service vs Pipeline vs Repository responsibilities
- Naming conventions
- Error handling patterns
- Logging standards
- How to add a new feature

---

## 📁 What's in `/docs`

```
docs/
├── HOW_IT_WORKS.md                  ← Implementation deep dive
├── LOCAL_SETUP.md                   ← Local dev setup guide
├── CAPABILITIES_AND_LIMITATIONS.md  ← What works / what doesn't
├── ARCHITECTURE_CHEAT_SHEET.md      ← Quick reference
├── ARCHITECTURE_SUMMARY.md          ← System overview
├── DATA_FLOW_DIAGRAMS.md            ← ASCII flow diagrams
├── CODING_GUIDELINES.md             ← Code standards
├── DOCUMENTATION_INDEX.md           ← This file
└── rag_system_diagram.png           ← Architecture diagram image
```

---

## ❓ Find What You Need

| I want to... | Read this |
|---|---|
| Get the project running locally | [LOCAL_SETUP.md](LOCAL_SETUP.md) |
| Understand how the chat pipeline works | [HOW_IT_WORKS.md](HOW_IT_WORKS.md) — Section 3 |
| Understand what hybrid search is | [HOW_IT_WORKS.md](HOW_IT_WORKS.md) — Section 4.4 |
| Understand what MMR does | [HOW_IT_WORKS.md](HOW_IT_WORKS.md) — Section 4.6 |
| Understand what query rewriting does | [HOW_IT_WORKS.md](HOW_IT_WORKS.md) — Section 4.3 |
| Know why a question got a bad answer | [CAPABILITIES_AND_LIMITATIONS.md](CAPABILITIES_AND_LIMITATIONS.md) |
| Get a quick overview of the stack | [ARCHITECTURE_CHEAT_SHEET.md](ARCHITECTURE_CHEAT_SHEET.md) |
| Add a new service or feature | [CODING_GUIDELINES.md](CODING_GUIDELINES.md) |
| See all env vars and what they do | [LOCAL_SETUP.md](LOCAL_SETUP.md) — Environment Variables section |
| See the system architecture diagram | [HOW_IT_WORKS.md](HOW_IT_WORKS.md) — top of file |

# 🎨 Premium UI/UX Design Generation Prompt

Below is a detailed, context-rich prompt tailored for UI generators (like v0, Bolt.new, Lovable, or Stitch) and design tools to build a premium interface for the **AI RAG PDF Chat** application.

---

```text
Create a high-fidelity, premium React dashboard with Tailwind CSS (or Vanilla CSS) for an "AI RAG PDF Chat" application. The interface should feel extremely premium, incorporating modern design best practices (curated dark slate/violet palette, glassmorphism, smooth animations, and clear micro-interactions).

### 1. App Layout & Architecture
The dashboard is split into three core visual panels:
1. LEFT SIDEBAR (Width: 320px): Document Management
   - Application Logo & Header (clean typography, e.g. "DocuQuery AI").
   - Drag-and-Drop Upload Zone: A visually appealing area that supports file picking. On dragging files, it transitions to an active state. Shows upload status: "Queued", "Processing (X%)", "Failed" with an error log, or "Ready".
   - Document List: Displays uploaded PDFs with details (Filename, File size, Pages, Chunk count).
   - Status Indicators: Distinct badge colors (Processing = Pulsing Amber, Completed = Emerald Green, Failed = Crimson Red with error tooltip).
   - Delete Button: An inline trash icon that pops a confirmation modal to safely delete the document.

2. CENTER CHAT INTERFACE (Flex-1): Interactive Q&A
   - Header Bar: Shows the currently selected document's name, active status, and a premium Dropdown Selector to swap LLM models (e.g., "Mixtral 8x7B" vs "Llama 3 70B").
   - Chat Message area: Displays user message bubbles (aligned right, slate/violet gradients) and AI response bubbles (aligned left, slate gray background).
   - Rich Text Capabilities: AI responses support markdown formatting, blockquotes, and code snippets with dark-mode syntax highlighting and a "Copy Code" button.
   - Loader Hook: A pulsing placeholder animation ("AI is retrieving context...") when waiting for a stream to start.
   - Message Input Bar: Locked to the bottom. Contains a text area, a attachment icon, a "Send" button, and a micro-status bar showing LLM execution metrics (e.g. "Tokens: 140 | Speed: 40 t/s | Model: Llama-3").

3. COLLAPSIBLE RIGHT PANEL (Width: 350px): Source Citations (RAG Context)
   - Displays the specific text chunks retrieved from the PDF that were used to formulate the AI's answer.
   - Each source card shows: Chunk index, text snippet, and a matching score indicator (e.g., "Similarity Match: 87.5%").

---

### 2. Backend Integration Specs (API Mapping)
The UI components must map directly to these actual backend routes:

1. Document Directory
   - Endpoint: GET /api/documents
   - Response Schema:
     {
       "success": true,
       "documents": [
         { "id": 1, "filename": "financial_report.pdf", "original_name": "Report Q1.pdf", "file_size": 204850, "status": "completed", "progress": 100, "total_chunks": 42 }
       ]
     }

2. File Upload Gateway
   - Endpoint: POST /api/upload (Multipart/form-data)
   - Response Schema: (Returns immediately with 202 Accepted status)
     {
       "success": true,
       "document": { "id": 2, "filename": "temp_xyz.pdf", "status": "processing" }
     }

3. Queue Processing Status (Polled or Websocket/SSE progress updates)
   - Endpoint: GET /api/upload/:documentId/progress
   - Response Schema:
     {
       "success": true,
       "document": { "id": 2, "status": "processing", "progress": 70, "totalChunks": 0 }
     }

4. Past Conversations Loader
   - Endpoint: GET /api/documents/:documentId/chat
   - Response Schema:
     {
       "success": true,
       "history": [
         { "id": 101, "user_message": "What is our net revenue?", "ai_response": "The net revenue is $2.4M...", "tokens_used": 180, "created_at": "2026-05-19T11:00:00Z" }
       ]
     }

5. Real-time Streaming Chat Engine
   - Endpoint: POST /api/chat/stream (Request: { "documentId": 1, "message": "query", "model": "llama-3-70b-8192" })
   - Format: Server-Sent Events (SSE)
   - Stream Chunk Types:
     - Event 'metadata': Contains vector source chunks
       data: { "chunks": [{ "chunkIndex": 3, "similarity": 0.895, "content": "Context snippet..." }] }
     - Event 'token': Streams individual natural language words
       data: "word "
     - Event 'done': Signals completion
       data: "[DONE]"
```

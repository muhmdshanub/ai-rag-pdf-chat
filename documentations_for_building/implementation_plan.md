# Frontend — Exhaustive Low-Level Implementation Plan

Built from: backend controller analysis + Joi schema validation + SSE protocol + full Stitch design file component inventory.

---

## Open Questions

> [!IMPORTANT]
> 1. **Delete document confirmation**: Should deleting a document show a confirmation dialog or delete immediately on click?
> 2. **New Chat button**: Should "New Chat" clear the current chat history display only (local reset), or does it call an API to start a new session?
> 3. **Model selector**: Should clicking the model pill open a dropdown to switch between `llama-3.3-70b-versatile` and `llama-3.1-8b-instant`, or is it display-only for now?
> 4. **Polling interval**: For processing documents, should we poll `GET /api/upload/:id/progress` every **2 seconds** until `status === 'completed' | 'failed'`?

---

## 1. Final Folder Structure

Every file that needs to be created or modified:

```
frontend/src/
│
├── services/
│   └── api.js                         ← Axios instance + all API call functions
│
├── context/
│   ├── DocumentContext.jsx             ← Documents list + upload queue + active doc
│   └── ChatContext.jsx                 ← Messages + streaming + model selection
│
├── hooks/
│   ├── useDocuments.js                 ← Reads DocumentContext
│   ├── useChat.js                      ← Reads ChatContext
│   └── useSSE.js                       ← Manages EventSource/fetch stream lifecycle
│
├── components/
│   │
│   ├── ui/                            ← Pure atomic components, no API knowledge
│   │   ├── Badge.jsx                   ← Status badge (Active / Processing / Error)
│   │   ├── ProgressBar.jsx             ← Thin 1px animated progress bar
│   │   ├── IconButton.jsx              ← Reusable icon-only button
│   │   ├── Spinner.jsx                 ← Loading spinner (if needed)
│   │   └── EmptyState.jsx              ← Reusable empty state card with icon + message
│   │
│   ├── layout/
│   │   ├── Sidebar.jsx                 ← Fixed left nav (already built, needs wiring)
│   │   └── TopAppBar.jsx               ← Fixed top bar (already built, needs wiring)
│   │
│   ├── documents/
│   │   ├── DocumentContextPanel.jsx    ← Left 320px column: drop zone + doc list
│   │   ├── DropZone.jsx                ← Drag-and-drop / click-to-browse upload target
│   │   ├── DocumentList.jsx            ← Maps over documents array → DocumentListItem
│   │   ├── DocumentListItem.jsx        ← Single document card (3 states: active/processing/error)
│   │   └── CitationPanel.jsx           ← Right 350px column: citation cards
│   │   └── CitationCard.jsx            ← Single citation card (primary/secondary variant)
│   │
│   └── chat/
│       ├── ChatArea.jsx                ← Center column container (already built, needs wiring)
│       ├── ChatHeader.jsx              ← Sticky bar: active doc badge + model selector
│       ├── ChatScrollArea.jsx          ← Scrollable message list
│       ├── UserMessageBubble.jsx       ← Right-aligned user message
│       ├── AIMessageBubble.jsx         ← Left-aligned AI response with markdown
│       ├── AIThinkingBubble.jsx        ← Animated "retrieving context..." indicator
│       ├── InlineCitationChip.jsx      ← "Ref [1]" chip inside AI message text
│       ├── ChatInputBar.jsx            ← Input textarea + toolbar + send button
│       └── ModelSelectorButton.jsx     ← Pill button showing active model name
│
└── pages/
    └── Dashboard.jsx                   ← Assembles all panels; provides contexts
```

---

## 2. API Service Layer — `services/api.js`

Single file. Uses **Axios** for all JSON endpoints. Uses native **fetch** for SSE streaming.

### 2a. Axios Instance Setup

```js
const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});
```

Request interceptor: none needed yet.  
Response interceptor: unwrap `response.data` so callers always get `{ success, data, message }`.

### 2b. All API Functions

#### `uploadDocument(file: File): Promise`
- Method: `POST /api/upload`
- Content-Type: `multipart/form-data` (Axios handles with FormData)
- Payload: `FormData` with key `file`
- **Success (202):** `{ success: true, data: { document: { id, filename, status, size, createdAt } }, message: "...", meta: { duration } }`
- **Error (400):** `{ success: false, error: "No file provided", code: "NO_FILE" }`

#### `getUploadProgress(documentId: number): Promise`
- Method: `GET /api/upload/:documentId/progress`
- Params: `documentId` in URL path
- **Success (200):** `{ success: true, data: { document: { id, filename, status, totalChunks, progress } } }`
- `progress` is `0-100`. Backend fallback: `COMPLETED → 100`, `FAILED → 0`, else `50`
- **Error (404):** NotFoundError from global middleware

#### `listDocuments(): Promise`
- Method: `GET /api/documents`
- **Success (200):** `{ success: true, data: { documents: [ ...docObjects ] } }`

#### `getDocument(id: number): Promise`
- Method: `GET /api/documents/:id`
- **Success (200):** `{ success: true, data: { document: { ...docObject } } }`
- **Error (404):** NotFoundError

#### `deleteDocument(id: number): Promise`
- Method: `DELETE /api/documents/:id`
- **Success (200):** `{ success: true, message: "Document deleted successfully" }` (no `data` key)
- **Error (404):** NotFoundError

#### `getChatHistory(documentId: number): Promise`
- Method: `GET /api/documents/:id/chat`
- **Success (200):** `{ success: true, data: { history: [ ...chatMessageObjects ] } }`
- **Error (404):** NotFoundError if document not found

#### `streamChatMessage(payload, onToken, onMetadata, onDone, onError): AbortController`
- Method: `POST /api/chat/stream` using native `fetch`
- Request body: `{ documentId: number, message: string, model?: string }`
- Validation BEFORE calling: `documentId` must be positive int, `message` must be 1–2000 chars
- Returns an `AbortController` so the caller can cancel the stream
- Parses SSE events:

| Event name | Data shape | Callback |
|---|---|---|
| `metadata` | `{ chunks: [{ chunkIndex, similarity }] }` | `onMetadata(chunks)` |
| `token` | raw string token | `onToken(token)` |
| `done` | literal `[DONE]` | `onDone()` |
| `error` | `{ error, code, statusCode }` | `onError(errorObj)` |

- Parsing strategy: read `response.body` as `ReadableStream`, decode with `TextDecoder`, buffer partial lines, split on `\n\n`, parse `event:` and `data:` lines from each block.

---

## 3. State Architecture

### 3a. `DocumentContext`

**State shape:**
```js
{
  documents: [],          // Array of document objects from backend
  activeDocumentId: null, // number | null — currently selected doc
  uploadQueue: {},        // { [tempId]: { fileName, progress, status, error } }
  isLoading: false,       // initial list fetch loading
  error: null             // string | null — list fetch error
}
```

**Actions / functions exposed via context:**

| Function | Description |
|---|---|
| `fetchDocuments()` | Calls `listDocuments()`, sets `documents`, sets `isLoading` |
| `uploadDocument(file)` | Validates file type (PDF only) + size (≤ 100MB), calls `uploadDocument()` API, adds to `uploadQueue`, starts polling loop |
| `startPolling(documentId)` | Calls `getUploadProgress()` every 2s, updates `documents[id].progress`, stops when `status === 'completed' \| 'failed'` |
| `setActiveDocument(id)` | Sets `activeDocumentId`; triggers `ChatContext.loadHistory(id)` |
| `deleteDocument(id)` | Calls `deleteDocument()` API, removes from `documents` array |

**File upload validation (client-side before API call):**
- File type: must be `application/pdf` or `.txt` — else show inline error in DropZone
- File size: must be ≤ 100MB — else show inline error in DropZone

---

### 3b. `ChatContext`

**State shape:**
```js
{
  messages: [],            // Array of message objects (see below)
  citations: [],           // Latest AI response chunk citations
  isGenerating: false,     // true during SSE stream → shows AIThinkingBubble
  model: 'llama-3.3-70b-versatile', // currently selected model
  tokenStats: { count: 0, speed: 0 }, // for stats bar display
  error: null              // string | null — chat error
}
```

**Message object shape:**
```js
{
  id: string,              // uuid or timestamp-based local ID
  role: 'user' | 'assistant',
  content: string,         // plain text for user; accumulated tokens for assistant
  timestamp: string,       // formatted display time e.g. "10:42 AM"
  citations: [],           // only for assistant messages — array of citation objects
  isStreaming: boolean      // true while tokens are still arriving
}
```

**Actions / functions exposed via context:**

| Function | Description |
|---|---|
| `loadHistory(documentId)` | Calls `getChatHistory(documentId)`, maps history → messages array |
| `sendMessage(text)` | Validates input, appends user message, sets `isGenerating = true`, calls `streamChatMessage()` |
| `appendToken(token)` | Appends string token to the last assistant message's `content` |
| `setMetadata(chunks)` | Stores citation chunk data in `citations` state; maps chunk index + similarity score |
| `finishGeneration()` | Sets `isGenerating = false`, sets `isStreaming = false` on last message |
| `setModel(modelId)` | Updates `model` state |
| `clearChat()` | Resets `messages` and `citations` to empty arrays |
| `setError(msg)` | Sets `error` string, sets `isGenerating = false` |

**Client-side validation before `sendMessage`:**
- `text.trim().length === 0` → do nothing (send button stays disabled)
- `text.length > 2000` → show character count warning, block submission
- `activeDocumentId === null` → show toast/inline error: "Select a document first"
- `isGenerating === true` → block submission (button disabled)

---

## 4. Component Specifications

### 4a. Atomic / UI Layer — `components/ui/`

#### `Badge.jsx`
**Props:**
```js
{ status: 'active' | 'processing' | 'error' | 'completed' }
```
**Renders:**
- `active` → `text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[11px]` text "Active"
- `processing` → amber variant with "Processing"
- `error` → red variant with "Failed"
- `completed` → same as active

---

#### `ProgressBar.jsx`
**Props:**
```js
{ progress: number, color?: 'primary' | 'tertiary' | 'error' }
```
**Renders:** Full-width track `bg-surface-container-highest rounded-full h-1` with inner fill div `style={{ width: progress + '%' }}`. Color maps to `bg-primary`, `bg-tertiary`, `bg-error`.

---

#### `IconButton.jsx`
**Props:**
```js
{ icon: string, onClick: () => void, className?: string, label: string }
```
**Renders:** Button with `<span className="material-symbols-outlined">` inside. `aria-label={label}` for accessibility.

---

#### `EmptyState.jsx`
**Props:**
```js
{ icon: string, title: string, description: string }
```
**Renders:** Centered flex-col with Material icon (48px, muted color), bold title, smaller subtitle. Used for: no documents, no chat history, no citations.

---

### 4b. `DropZone.jsx`

**Props:**
```js
{
  onFileAccepted: (file: File) => void,
  isUploading?: boolean,
  error?: string | null
}
```

**States:**
- **Idle:** dashed border `border-outline-variant/50`, cloud icon muted
- **Drag over (`isDragActive`):** border → `border-primary/50`, bg → `bg-surface-container/50`, icon scales up via `group-hover:scale-110`
- **Error:** show `error` string below the zone in `text-error text-label-sm`

**Internal state:** `isDragActive: boolean`

**Behavior:**
- `onDragOver` / `onDragEnter` → set `isDragActive = true`
- `onDragLeave` / `onDrop` → set `isDragActive = false`
- `onDrop` → extract `event.dataTransfer.files[0]`, validate type/size, call `onFileAccepted(file)`
- `onClick` → programmatically click a hidden `<input type="file" accept=".pdf,.txt">`

---

### 4c. `DocumentListItem.jsx`

**Props:**
```js
{
  id: number,
  fileName: string,
  fileSize?: string,
  chunkCount?: number,
  status: 'completed' | 'processing' | 'failed',
  progress?: number,
  statusText?: string,
  errorMessage?: string,
  isActive?: boolean,
  onSelect: (id: number) => void,
  onDelete: (id: number) => void,
  onRetry?: (id: number) => void
}
```

**Conditional rendering rules:**
- `status === 'completed'` → show `check_circle` icon + `Active` badge + size + chunk count
- `status === 'processing'` → show `<ProgressBar progress={progress}>` + `statusText` with `animate-pulse-soft`; progress % text also `animate-pulse-soft`
- `status === 'failed'` → show `error` icon + `errorMessage` + `Retry` button
- Delete button (trash icon): always rendered but `opacity-0 group-hover:opacity-100`; calls `onDelete(id)` on click

**Color accent bar** (`absolute top-0 left-0 w-1 h-full`):
- `completed` → `bg-primary opacity-80`
- `processing` → `bg-tertiary opacity-80`
- `failed` → `bg-error opacity-60`

---

### 4d. `DocumentList.jsx`

**Props:**
```js
{
  documents: DocumentItem[],
  activeDocumentId: number | null,
  onSelect: (id: number) => void,
  onDelete: (id: number) => void
}
```
**Renders:** `flex flex-col gap-2`. Maps `documents → <DocumentListItem>`. If `documents.length === 0` → renders `<EmptyState icon="folder_open" title="No documents" description="Upload a PDF to get started">`.

---

### 4e. `CitationCard.jsx`

**Props:**
```js
{
  chunkId: number,
  matchScore: number,    // e.g. 89.5
  text: string,
  highlightedTerms?: string[],
  isPrimary: boolean,    // drives styling variant
  onViewInPdf?: () => void
}
```
**Rendering differences:**
- `isPrimary = true` → `bg-surface-container-high/60`, chunk label in `text-primary`, score badge in `bg-primary/10 border-primary/20 text-primary`, 4-line clamp, keyword highlighting, "View in PDF" footer
- `isPrimary = false` → `bg-surface-container-high/40`, chunk label in `text-on-surface-variant group-hover:text-primary`, score badge in `bg-white/5 border-white/10 text-on-surface-variant`, 3-line clamp, no keyword highlighting, no footer

**Keyword highlighting logic:** Replace each `highlightedTerm` in `text` with `<span className="bg-primary/20 text-primary-fixed rounded px-0.5">term</span>`. Use a helper `highlightText(text, terms)` function in `utils/formatters.js`.

---

### 4f. `ChatHeader.jsx`

**Props:**
```js
{
  activeDocumentName: string | null,
  model: string,
  onModelChange: (modelId: string) => void,
  onNewChat: () => void
}
```
**Renders:**
- Left: "Querying:" label + `<ActiveDocumentBadge>` (show "No document selected" if null)
- Right: `<ModelSelectorButton model={model} onChange={onModelChange}>`

---

### 4g. `ModelSelectorButton.jsx`

**Props:**
```js
{
  model: string,         // e.g. 'llama-3.3-70b-versatile'
  onChange: (id: string) => void,
  isOpen: boolean,
  onToggle: () => void
}
```
**Model display names mapping:**
```js
const MODEL_NAMES = {
  'llama-3.3-70b-versatile': 'Llama 3.3 70B',
  'llama-3.1-8b-instant': 'Llama 3.1 8B'
}
```
**Renders:** The glowing dot + model name + `expand_more` icon button. Dropdown (if `isOpen`): simple list of the two models.

---

### 4h. `UserMessageBubble.jsx`

**Props:**
```js
{ content: string, timestamp: string }
```
**Renders:** Right-aligned, `animate-enter` on mount, timestamp below-right, `opacity-60`.

---

### 4i. `AIMessageBubble.jsx`

**Props:**
```js
{
  content: string,
  citations: Citation[],   // for inline ref chips
  isStreaming: boolean,    // shows blinking cursor if true
  onCopy: () => void,
  onThumbUp: () => void,
  onThumbDown: () => void
}
```

**Content rendering strategy:**
- Split `content` by citation pattern (e.g. `[REF:1]`) → replace with `<InlineCitationChip refNumber={1}>`
- Render headings, paragraphs, lists, and code blocks based on markdown-like patterns OR use `react-markdown` library

> [!IMPORTANT]
> **Decision needed**: Should we use the `react-markdown` npm package for proper markdown parsing, or parse manually? `react-markdown` is the safer option for long-term maintainability.

**Streaming cursor:** When `isStreaming === true`, append a blinking `|` at end of content via CSS animation.

---

### 4j. `AIThinkingBubble.jsx`

**Props:** `{ message?: string }` (defaults to "AI is retrieving context...")  
**Renders:** Only shown when `ChatContext.isGenerating === true`. Avatar with `animate-ping` ring + `hourglass_empty` icon with `animate-pulse-soft` + shimmer text. Gets `.animate-enter .delay-200`.

---

### 4k. `ChatInputBar.jsx`

**Props:**
```js
{
  value: string,
  onChange: (val: string) => void,
  onSubmit: () => void,
  isDisabled: boolean,
  tokenCount: number,
  tokensPerSecond: number
}
```

**Internal behavior:**
- `textarea` auto-resize: use `useRef` + `useEffect` to set `textarea.style.height = 'auto'` then `textarea.style.height = textarea.scrollHeight + 'px'` on every `value` change
- **Enter key:** `onKeyDown` → if `e.key === 'Enter' && !e.shiftKey` → `e.preventDefault()` + call `onSubmit()`
- **Shift+Enter:** allows newline insertion (default behavior preserved)
- **Send button disabled when:** `value.trim().length === 0 || isDisabled`
- **Character counter:** show remaining chars when `value.length > 1800` (e.g. "187 / 2000") in `text-error` when > 1900

---

## 5. SSE Streaming — Detailed Integration

### `useSSE.js` hook

```js
function useSSE() {
  // Returns: { startStream, abortStream }
  // startStream(payload, { onToken, onMetadata, onDone, onError })
  // abortStream() → calls abortController.abort()
}
```

**Full streaming lifecycle in `ChatContext.sendMessage(text)`:**

```
1. Validate input (see §3b above)
2. Append user message to messages[]
3. Append empty assistant message { role:'assistant', content:'', isStreaming:true }
4. Set isGenerating = true
5. Call startStream({ documentId, message: text, model })
6. ON 'metadata' event → call setMetadata(chunks) → updates citations panel
7. ON 'token' event → call appendToken(token) → concatenates to last assistant message content
8. ON 'done' event → call finishGeneration() → isGenerating=false, isStreaming=false
9. ON 'error' event → call setError(error.message)
10. ON network failure (fetch throws) → call setError('Connection lost. Please try again.')
```

**SSE parsing — line-by-line:**
```
Raw SSE chunk from server:
  "event: token\ndata: \"The\"\n\nevent: token\ndata: \" document\"\n\n"

Split on "\n\n" → each block is one event
For each block:
  - Extract "event: xxx" line → eventName
  - Extract "data: yyy" line → rawData
  - If eventName === 'token' → JSON.parse(rawData) → string token
  - If eventName === 'metadata' → JSON.parse(rawData) → { chunks: [...] }
  - If eventName === 'done' → rawData === '[DONE]' → trigger onDone
  - If eventName === 'error' → JSON.parse(rawData) → { error, code, statusCode }
```

---

## 6. Data Polling — Processing Documents

**In `DocumentContext.startPolling(documentId)`:**

```
1. Store intervalId = setInterval(async () => {
2.   const { data } = await getUploadProgress(documentId)
3.   Update documents[documentId].progress = data.document.progress
4.   Update documents[documentId].status = data.document.status
5.   If status === 'completed' OR status === 'failed':
6.     clearInterval(intervalId)
7.     Call fetchDocuments() to refresh the full list
8. }, 2000)

9. Store intervalId in a ref (useRef) for cleanup
10. clearInterval on component unmount (cleanup in useEffect return)
```

---

## 7. Empty States — All Three Panels

| Panel | Condition | EmptyState props |
|---|---|---|
| DocumentList | `documents.length === 0` | icon: `folder_open`, title: "No documents yet", desc: "Upload a PDF to begin" |
| ChatScrollArea | `messages.length === 0` | icon: `chat_bubble_outline`, title: "Ask your first question", desc: "Select a document and start chatting" |
| CitationPanel | `citations.length === 0` | icon: `find_in_page`, title: "No citations yet", desc: "Citations will appear here after your first response" |

---

## 8. Error States

| Scenario | Where shown | Message |
|---|---|---|
| Upload fails (NO_FILE) | DropZone inline error | "Upload failed. Please try again." |
| File type invalid (client) | DropZone inline error | "Only PDF files are supported." |
| File too large (client) | DropZone inline error | "File must be under 100MB." |
| Document not found on chat | ChatScrollArea | "Document not found. Please re-upload." |
| LLM generation failed | Below last message | "Failed to generate response. Please try again." |
| Network failure (stream) | Below last message | "Connection lost. Please try again." |
| Input > 2000 chars | Below textarea | "Message too long (max 2000 characters)." |
| No document selected when sending | Below textarea | "Please select a document first." |

---

## 9. `utils/formatters.js`

Functions to implement:
- `formatFileSize(bytes: number): string` → e.g. `2457600 → "2.4 MB"`
- `formatTimestamp(date: Date | string): string` → e.g. `"10:42 AM"`
- `highlightText(text: string, terms: string[]): ReactNode[]` → wraps matched substrings in highlight spans
- `formatMatchScore(score: number): string` → e.g. `0.895 → "89.5%"` (score from backend is 0–1, display as %)

---

## 10. `utils/constants.js`

```js
export const DOCUMENT_STATUS = {
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
}

export const MODELS = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', recommended: true },
  { id: 'llama-3.1-8b-instant',    name: 'Llama 3.1 8B', recommended: false }
]

export const POLL_INTERVAL_MS = 2000
export const MAX_MESSAGE_LENGTH = 2000
export const MAX_FILE_SIZE_MB = 100
export const ACCEPTED_FILE_TYPES = ['application/pdf', 'text/plain']
```

---

## 11. `vite.config.js` — API Proxy

To avoid CORS issues in development, add a proxy so `/api/*` requests from the React dev server forward to `localhost:5000`:

```js
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:5000',
      changeOrigin: true
    }
  }
}
```

---

## 12. Execution Order for IDE

Execute in this exact order — each step depends on the previous:

1. `utils/constants.js` — no dependencies
2. `utils/formatters.js` — no dependencies
3. `services/api.js` — depends on constants
4. `components/ui/Badge.jsx` — no dependencies
5. `components/ui/ProgressBar.jsx` — no dependencies
6. `components/ui/IconButton.jsx` — no dependencies
7. `components/ui/EmptyState.jsx` — no dependencies
8. `components/ui/Spinner.jsx` — no dependencies
9. `components/documents/DropZone.jsx` — depends on ui atoms
10. `components/documents/DocumentListItem.jsx` — depends on Badge, ProgressBar, IconButton
11. `components/documents/DocumentList.jsx` — depends on DocumentListItem, EmptyState
12. `components/documents/CitationCard.jsx` — depends on formatters
13. `components/documents/CitationPanel.jsx` — depends on CitationCard, EmptyState
14. `components/chat/ModelSelectorButton.jsx` — depends on constants
15. `components/chat/ChatHeader.jsx` — depends on ModelSelectorButton
16. `components/chat/InlineCitationChip.jsx` — no dependencies
17. `components/chat/UserMessageBubble.jsx` — depends on formatters
18. `components/chat/AIMessageBubble.jsx` — depends on InlineCitationChip, formatters
19. `components/chat/AIThinkingBubble.jsx` — no dependencies
20. `components/chat/ChatScrollArea.jsx` — depends on all bubble components, EmptyState
21. `components/chat/ChatInputBar.jsx` — depends on IconButton
22. `components/chat/ChatArea.jsx` — depends on ChatHeader, ChatScrollArea, ChatInputBar
23. `components/documents/DocumentContextPanel.jsx` — depends on DropZone, DocumentList
24. `hooks/useSSE.js` — depends on api.js
25. `context/DocumentContext.jsx` — depends on api.js, constants
26. `context/ChatContext.jsx` — depends on api.js, useSSE, constants
27. `hooks/useDocuments.js` — depends on DocumentContext
28. `hooks/useChat.js` — depends on ChatContext
29. `components/layout/Sidebar.jsx` — wire to context (already built, needs nav state)
30. `components/layout/TopAppBar.jsx` — wire onNewChat to ChatContext.clearChat
31. `pages/Dashboard.jsx` — assembles everything, wraps in both Contexts
32. `vite.config.js` — add proxy config

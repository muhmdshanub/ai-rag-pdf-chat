# 🧠 AI-Friendly Architectural Rules & Coding Guidelines

*Copy and paste this ruleset into your system prompts or share it with AI coding assistants to ensure they write code that adheres to this project's enterprise architecture.*

---

## 🏗️ 1. Project-Specific Layer Rules
This application strictly follows a decoupled, 5-layer architecture. Code MUST be placed in the appropriate layer, and layers MUST NOT skip or jump backwards.

### Layer 1: Middleware (The Bouncers)
- **Responsibility:** Syntactical validation (Joi/Zod), authentication, and HTTP request parsing.
- **Rules:**
  - MUST NOT query the database.
  - MUST NOT contain business logic.
  - MUST intercept and reject badly formed requests (400 Bad Request) before they reach the controller.

### Layer 2: Controllers & Jobs (The Receptionists)
- **Responsibility:** HTTP/Queue routing and mapping.
- **Rules:**
  - MUST remain "ultra-thin".
  - MUST NOT contain multi-step business orchestration.
  - MUST NOT call the database (Models) directly for mutations or complex queries.
  - MUST delegate all actual work to a **Pipeline**.
  - **API Responses:** MUST use the global `ApiResponse` utility to format all successful HTTP responses to guarantee a strictly uniform JSON schema for the frontend.

### Layer 3: Pipelines (The Orchestrators)
- **Responsibility:** Managing multi-step business workflows (The "Use Cases").
- **Rules:**
  - This is the ONLY place where multiple services are called in a sequence (e.g., Read File ➔ Parse PDF ➔ Chunk ➔ Embed ➔ Save).
  - MUST extract dependencies dynamically (e.g., `const { storage } = require('../registry');`) inside methods to **prevent circular dependencies**.
  - MUST NOT contain low-level logic (like parsing buffers or writing to disks). It just coordinates the Services.

### Layer 4: Services (The Specialists)
- **Responsibility:** Pure, isolated, single-responsibility logic (e.g., `PDFParser`, `Storage`, `Cache`, `Chunking`).
- **Rules:**
  - MUST NOT call other Services (prevents "Service Spaghetti").
  - MUST NOT know about the HTTP layer (`req`, `res`).
  - MUST have zero knowledge of the orchestration flow.
  - Examples: The `PDFParserService` only knows how to turn a Buffer into text. The `StorageService` only knows how to read/write to disk. 

### Layer 5: Models (The Data Guardians)
- **Responsibility:** Database queries and data-state business rules.
- **Rules:**
  - MUST encapsulate all SQL/ORM logic. No SQL should exist outside of `src/models/`.
  - MUST encapsulate business state validation (e.g., `findReadyForChat(id)` checking if a document is `status: 'completed'`).

---

## 🎯 2. General Enterprise Coding Rules

### 1. Dependency Injection via Registry
- **Rule:** Never `require()` a service, model, or pipeline directly from its file path if you are consuming it to do work.
- **Why:** Centralizes dependency management, prevents circular loops, and makes unit testing incredibly easy.
- **How:** ALWAYS import dependencies from `src/registry.js`. 

### 2. Single Responsibility Principle (SRP)
- **Rule:** A class/file must do exactly ONE thing.
- **Example:** If a class parses a PDF *and* caches the result *and* reads from the file system, it is doing three things. Split it into `PDFParser`, `CacheService`, and `StorageService`.

### 3. Graceful Degradation (Fail-Open vs. Fail-Closed)
- **Rule:** Secondary features must not crash primary features.
- **Example:** If the `CacheService` (Redis) fails, it MUST NOT throw an error that crashes the document upload. It must log a warning and return `null`, allowing the app to fall back to the slower, non-cached path (Fail-Open). Conversely, if the `StorageService` fails to find the PDF file, it MUST throw an error and stop the process (Fail-Closed).

### 4. Encapsulation & Privacy (`_` prefix)
- **Rule:** Hide internal logic from consumers.
- **How:** Any method in a class that is not meant to be called from the outside MUST be prefixed with an underscore (`_helperMethod()`) and documented with `@private`.

### 5. Standardized Error Handling
- **Rule:** Never throw raw `Error("string")` objects.
- **How:** Always throw specialized domain errors (`ServiceError`, `NotFoundError`, `BadRequestError`). This allows the global error middleware to format them consistently for the frontend.

### 6. DRY Utilities
- **Rule:** If you write a stateless helper function (like string sanitization, date parsing, or hashing) more than once, move it to `src/utils/helpers.js` or a similar global utility file.

### 7. Avoid Circular Dependencies
- **Rule:** A requires B, and B requires A = 💥 Application Crash.
- **How:** 
  1. Services never call Services.
  2. Use Pipelines for orchestration.
  3. If a Pipeline needs multiple dependencies, require the registry *inside the method block* (dynamically), not at the top of the file.

### 8. Defensive Programming
- **Rule:** Never trust your inputs, even deep within the application.
- **How:** Even if Joi validates HTTP input, the `PDFParserService` must STILL check `if (!Buffer.isBuffer(buffer))` before parsing. Validate at the boundaries (HTTP), and guard at the core (Services).

# GKCHATTY - Universal Document Knowledge Base & AI Assistant

## Project Goal
Build an enterprise AI-powered knowledge base (RAG system) for GOAT insurance, featuring strict separation between a central System KB and user-uploaded documents, with user control over search scope.

## Roadmap

**Phase 0: Foundation** (✅ COMPLETED)
*   Objective: Establish the project structure and core development environment.
*   Key Tasks:
    *   Setup pnpm monorepo (apps/api, apps/web).
    *   Initialize Next.js frontend (TypeScript, Tailwind CSS).
    *   Initialize Node.js/Express backend API (TypeScript).
    *   Configure basic local development environment (`pnpm run dev`).
    *   Basic Git setup and version control.

**Phase 1: Core RAG MVP (In-Memory)** (✅ COMPLETED)
*   Objective: Validate the core Retrieval-Augmented Generation logic without database persistence.
*   Key Tasks:
    *   Implement basic text extraction and chunking functions.
    *   Integrate basic OpenAI API calls for embeddings and chat completion.
    *   Simulate vector search (e.g., using simple in-memory arrays/cosine similarity).
    *   Create a minimal API endpoint for chat queries.
    *   Develop rudimentary UI for asking questions and seeing responses.

**Phase 2: Persistence & Separation** (✅ COMPLETED)
*   Objective: Implement database persistence, file storage, and the core System KB vs. User Document separation.
*   Key Tasks:
    *   Integrate ChromaDB (Docker) as the vector store.
    *   Integrate MongoDB Atlas as the metadata store.
    *   Implement persistent file storage for user uploads (`apps/api/uploads/`).
    *   Create System KB loading script (`loadSystemKnowledge.ts`) to populate `system_knowledge` ChromaDB collection.
    *   Implement User Document lifecycle:
        *   `POST /upload` API: Receive file, chunk, embed, store in ChromaDB (`user_documents`) and MongoDB (`userDocuments`).
        *   `GET /documents` API: List user documents from MongoDB.
        *   `DELETE /documents/:id` API: Remove user doc from MongoDB & ChromaDB.
    *   Implement `searchMode` logic in `POST /chat` API to query the correct ChromaDB collection.
    *   Develop frontend UI:
        *   `FileUpload` component.
        *   `DocumentList` component with delete functionality.
        *   `ChatInterface` with searchMode toggle (radio buttons).

**Phase 3: Source Linking & Viewing** (📍 WE ARE HERE)
*   Objective: Enhance the chat experience by linking AI responses back to specific sources and allowing users to view/verify them within the app.
*   Key Tasks:
    *   **3a: Backend Prep** (✅ COMPLETED)
        *   Create PDF serving endpoints (`/api/documents/system/:filename`, `/api/documents/user/:id`).
        *   Implement page number extraction during chunking (`pdfUtils.ts`) for both user uploads and System KB loading.
        *   Enhance Chat API (`/api/documents/chat`) response to include detailed `sources` array (filename, pageNumbers, type, documentId, chunk text).
    *   **3b: Frontend Viewer Integration** (✅ COMPLETED - Core Functionality)
        *   Install `react-pdf`.
        *   Create `PdfViewerModal` component.
        *   Fix PDF worker loading issues (using CDN worker).
        *   Integrate modal: Clicking a source in `ChatInterface` opens the `PdfViewerModal` with the correct PDF and initial page number.
        *   Pass source `chunkText` prop down to the modal.
        *   Add basic page navigation (Prev/Next buttons & logic) to the modal.
    *   **3c: Highlighting & Polish** (⏳ IN PROGRESS)
        *   Implement Text Highlighting Logic (🎯 **NEXT TASK**): Make `PdfViewerModal` visually highlight the `chunkText` on the displayed page using `react-pdf`'s custom text rendering.
        *   Refine PDF Viewer UI/UX (Deferred - e.g., improve navigation controls, zoom, layout).

**Phase 4: Enterprise Features & MVP Polish** (Future)
*   Objective: Add core features required for enterprise use and improve overall robustness and usability.
*   Key Tasks:
    *   Implement User Authentication & Authorization (e.g., Login, sessions/JWT).
    *   Implement basic Role-Based Access Control (if needed - e.g., admin vs. user).
    *   UI/UX Polish Pass (Consistent styling, improved loading/error states, accessibility).
    *   Input Validation (Frontend & Backend).
    *   API Rate Limiting (Basic).
    *   Centralized Configuration Management (Refine `.env` usage).
    *   Improve error handling and reporting (User-friendly messages, backend logging).

**Phase 5: Advanced RAG & Scalability** (Future)
*   Objective: Enhance the quality, accuracy, and performance of the RAG system.
*   Key Tasks:
    *   Explore advanced text chunking strategies (semantic, recursive, overlap tuning).
    *   Evaluate and potentially integrate different/better embedding models.
    *   Implement hybrid search (vector + keyword search).
    *   Add re-ranking layer for search results.
    *   Explore context compression or distillation techniques.
    *   Advanced prompt engineering for better AI responses.
    *   Performance Optimization (API response times, database query tuning, caching).
    *   Analyze and plan for basic scalability (e.g., ensuring stateless API for potential horizontal scaling).

**Phase 6: Production Readiness & Deployment** (Future)
*   Objective: Prepare the application for a stable and secure production deployment.
*   Key Tasks:
    *   Comprehensive Testing (Unit tests, Integration tests, End-to-End tests).
    *   Security Hardening (Dependency scanning, input sanitization review, security headers).
    *   Monitoring & Alerting Setup (Health checks, performance metrics, error tracking).
    *   Centralized Logging Implementation.
    *   Containerization (Dockerfile for API, Dockerfile for Web).
    *   CI/CD Pipeline Setup (Automated testing, building, deployment).
    *   Production Database Configuration (Backups, connection pooling, potentially replicas).
    *   Infrastructure Provisioning (Cloud hosting, managed DBs, Vector DB hosting).
    *   Final Documentation (Technical architecture, Deployment guide, User guide).

**Phase 7: Post-Launch & Iteration** (Future)
*   Objective: Maintain the application and incorporate user feedback for continuous improvement.
*   Key Tasks:
    *   Monitor application performance and stability.
    *   Gather user feedback and bug reports.
    *   Plan and implement feature enhancements based on feedback.
    *   Perform regular maintenance (dependency updates, security patches).
    *   Optimize costs and performance based on real-world usage. 
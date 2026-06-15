### Overview
- A multi-service platform: Frontend (Next.js), Backend (Node.js/Express + Socket.IO), AI Module (FastAPI), Docker runtime for execution, and Supabase (Postgres + RLS).
- Core features: session-based container execution, LHIS (Living AI Interviewer) depth questions, comparative prompts using stored approaches, per-parameter countdown timers with auto-advance dialog, and robust test coverage for critical flows.

### Architecture
- Frontend: Next.js app with room-based coding UI, chats, container execution, and assessment overlays.
- Backend: Express REST APIs, Socket.IO for real-time communication, production container service for Docker execution, LHIS service for parameter detection and depth questions.
- AI Module: FastAPI service generating structured approaches (`/generate-approaches`) used by LHIS for comparative context.
- Supabase: Stores `job_profiles`, `problem_solutions` (RLS), `assessment_sessions`.
- Docker: Core and framework containers kept running to execute user code with correct file mappings and paths.

### Ports
- Backend/API and Socket.IO: `http://localhost:5001`
- Frontend references are updated to port 5001.
- Next.js proxy was removed for reliability; direct absolute URLs are used.

### Containers and Execution
- Core containers: `interview-java-core`, `interview-python-core`, `interview-javascript-core`
- Framework containers: `interview-python-django`, `interview-java-springboot`, `interview-javascript-express`
- All core containers run `tail -f /dev/null` to persist.
- Java core execution: correct path mapping; removed premature Dockerfile compilation; compile/run per code type.
- Django execution: includes `makemigrations` and `migrate` and touches `wsgi.py` for reload.
- Backend `POST /api/execute`:
  - Input: `sessionId`, `code`, `language`, `framework`, `questionId`
  - Returns: `{ success, session, output, error, executionTime }`
  - For console apps, `session.webUrl` is nullified to avoid preview auto-opening.

### LHIS (Living AI Interviewer)
- Purpose: Detects parameters from code updates, generates depth questions (1–3) with comparative context from stored approaches, evaluates answers, and manages progression.
- Key logic in `backend/src/services/living-ai-interviewer.js`:
  - `initializeAssessment`: ensures session, shapes, and in-memory state
  - `analyzeCodeProgress`: thresholds and heuristics for detection gating
  - `generateAIDepthQuestion`: integrates approaches, caps content by confidence/token budget, falls back if needed
  - `processAnswer`: routes to `next_depth`, `next_parameter`, `assessment_complete`, or `retry`
  - `getAssessmentStatus` and `calculateOverallProgress`: stable progress reporting
- Socket Integration (`backend/src/sockets/assessment-socket.js`):
  - Emits `chatMessage` for parameter questions with `questionContext` containing `parameterId` and `depthLevel`
  - Emits feedback, transition, and completion messages
  - Uses `checkForParameterQuestion` to generate and deliver next relevant depth question

### Comparative Context and Approaches
- `problem_solutions` table: stores approaches with title, summary, pros/cons, complexity, tags, confidence, version, is_active.
- `problemSolutionsService.fetchActiveApproachesByProblemId` fetches relevant approaches.
- `approachPromptUtil.buildApproachComparisonContext` formats context for AI prompts.
- AI module `/generate-approaches`: returns JSON to seed `problem_solutions`.

### Frontend Room Flow
- Questions (parameters) loaded from `/api/parameter-selection/available-problems`
  - Tabs represent parameters (1–3) as chosen by the interviewer (core language and optional framework/stack).
- Code execution:
  - Uses session container if available; otherwise fallback request is supported
  - Console output appended to the current question’s console buffer
  - Preview opens only when `webUrl` present
- Chat and LHIS:
  - LHIS parameter questions arrive with `questionContext` carrying `parameterId` and `depthLevel`
  - Feedback messages clear awaiting states
  - Parameter questions extend the active tab timer by +1 minute

### Timers and Completion
- Per-parameter countdown timer:
  - 10 minutes per parameter; starts when a tab is activated (attempted)
  - Each depth question adds +1 minute to the active parameter’s timer
- On parameter timer expiry:
  - A dialog appears with a visible 1-minute countdown; switches to next tab automatically if no action
- Completion rules:
  - A parameter is “attempted” on tab switch (timer starts)
  - Completion triggers when all tabs are attempted and either:
    - All parameters are fully answered (reached depth 3), or
    - All attempted tabs’ timers have ended
  - Completion dialog uses shadcn `AlertDialog`
- Answer-driven progress:
  - Does not auto-switch tabs; it posts feedback/questions and extends timers accordingly
- Candidate cannot move to the next parameter until current is complete by answer (all depths) or by timer expiry-confirmation flow

### API Endpoints (selected)
- `POST /api/session-containers/dev/create` (non-prod helper): create sessions without auth for testing
- `GET /api/session-containers/:problemId`: get session container status for a question tab; uses auth headers
- `POST /api/execute`: run code in session container
- `GET /api/parameter-selection/available-problems`: return problems per job profile (parameters)
- AI module: `POST /generate-approaches` returns structured approach JSON

### Database
- Tables:
  - `job_profiles`: includes parameters (core_language, tech_stack, etc.)
  - `problem_solutions`: approaches used for comparative prompts; RLS with admin-only write, authenticated read
  - `assessment_sessions`: tracks `assessment_state`, start time, and status
- RLS: admin can write to `problem_solutions`, authenticated read for candidates
- Types: `problem_id` is integer (to match Supabase updates you applied)

### Logging
- Non-production full logs enabled
- Console spam was eliminated by:
  - Removing legacy container polling
  - Introducing `notFound` flags to stop 404 loops
  - Corrected container name resolution and single-session usage

### Tests (selected)
- Unit/flow/E2E style tests under `backend/src/services/__tests__/`:
  - `problemSolutionsService.test.js`: fetch approaches
  - `living-ai-interviewer-approach.test.js`: prompt context formatting
  - `lhis-e2e-core-depth.test.js`: core languages, thresholds, depth progression, gating
  - `lhis-auto-trigger.test.js`: auto-trigger path for parameter questions
  - `lhis-concurrency.test.js`: locks guard concurrent AI calls
  - `living-ai-detectLanguage.test.js`: language detection
  - `approachPromptUtil-cap.test.js`: capping logic
  - `route-socket-integration.test.js`: basic HTTP/Socket health
- All tests updated to fit the new shapes and flows; concurrency and rejection-style tests emphasize robustness

### Known Mappings and Assumptions
- Tabs map to parameters from the DB problems endpoint; “attempted” means the tab was activated.
- LHIS `parameterId` to tab mapping: currently assumed to be the active tab at the time of the depth question; this is tracked in `parameterTabMapping`.
- Interviewer selects 1–3 parameters (e.g., core language + framework). Candidate must attempt all chosen parameters to complete the test.

### Developer Notes
- Keep environment variables aligned with port 5001 in the frontend `.env.local` (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`).
- Avoid Next.js dev rewrites for API; direct absolute URLs are more reliable in this setup.
- Docker-compose contexts and Dockerfiles are corrected; run via `backend/docker-environments/manage.sh` with explicit `-f`.

### What to test manually now
- Start backend (5001), AI module, and compose containers. Verify:
  - Joining room, problems load, timers start on tab activation
  - Code executes in correct container; console output appears; preview opens only when `webUrl` present
  - LHIS messages arrive; on parameter_question, timer extends by 60s
  - On timer expiry, dialog shows and auto-switches after 60s if no action
  - Completion dialog triggers under both paths: (a) all depths answered, (b) all timers ended for attempted tabs
  - Database rows created/queried without errors (assessment_sessions, problem_solutions reads, job_profiles fetch)


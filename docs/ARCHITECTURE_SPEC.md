# Overforge — Production Re-Architecture Spec

> Status: **DRAFT for sign-off**. No M1 code is written until this is approved.
> Owner: Amit. Author: senior-engineer pass, 2026-06.

## 0. Principles (the bar every decision is held to)

1. **Determinism over cleverness.** The interview is a finite state machine. The LLM never decides control flow — it fills slots and answers bounded questions. Every transition is replayable from Supabase.
2. **Code is a liability.** We delete ~55k LOC of parameter-rubric/multi-provider/duplicate-component slop down to a lean core. Fewer files, fewer abstractions, fewer dependencies.
3. **Two services, one mind.** Node/TypeScript end-to-end (frontend + backend). The Python `ai_module` is deleted.
4. **Fail predictably.** Voice degrades to chat. Minimax outage → graceful resume. Scoring is a separate deterministic pass, never live "vibes."
5. **Secure by default.** Real auth (Supabase, SSR middleware gating — no localStorage auth), strict Postgres constraints, clean RLS.

---

## 1. Target architecture

```
FRONTEND  Next.js (App Router) on Vercel  ← gitlab.com (auto: prod on main, preview on MR)
  /                landing (design-system hero, GSAP, waveform)
  /auth/*          Supabase Auth: email+password, magic link, Google, GitHub
  /dashboard       interviewer: create/track interviews, view scorecards
  /interview/[id]  split-pane: editor+terminal (left) | comms widget (right)
  - SSR auth via middleware; Supabase client for auth + realtime only.
  - Keeps the existing code editor (CodeMirror). Everything else rebuilt.
        │  WebSocket (Socket.io) + REST
        ▼
BACKEND   Oracle VPS, Docker, behind Caddy (auto-TLS), 2 services:
  Service 1 — Core API & Orchestration (Node/TS)
    • WS event bus: chat / voice / code / state events
    • interviewMachine.ts  — deterministic FSM (the only control flow)
    • minimax.ts           — one pinned client: LLM + TTS + ASR
    • scoring.ts           — deterministic post-interview pass
    • notify.ts            — outbox → Resend (interviewer scorecard email)
  Service 2 — Execution Kernel (self-hosted Judge0)
    • run-and-capture: code + stdin → stdout/stderr/time/memory. Pre-warmed.
        │  PostgreSQL driver + Supabase client
        ▼
SUPABASE  Postgres (data + realtime + auth)
  • interviews (UUID id) + interview_events (append-only) + notify_outbox
  • RLS: interviewer owns row; candidate reaches only their row via token
  • Realtime: frontend subscribes to its interview row for live state
```

Deployables: **2** (Vercel frontend, VPS backend with 2 Docker services). Down from 3.

---

## 2. Data model (Supabase Postgres)

Refines the proposed `interviews` table; adds append-only events (replay/determinism) and an email outbox (reliable notification). All timestamps `timestamptz`.

```sql
create type interview_status as enum ('invited','in_progress','completed','scored','expired','abandoned');
create type interview_phase  as enum ('greeting','oral','handoff','coding','wrap_up','scoring','done');

create table interviews (
  id                uuid primary key default gen_random_uuid(),
  interviewer_id    uuid not null references auth.users(id) on delete cascade,
  candidate_email   text not null,
  candidate_name    text,
  status            interview_status not null default 'invited',
  phase             interview_phase  not null default 'greeting',
  fsm_state         jsonb not null default '{}'::jsonb,   -- machine context (current node, follow-up counters)
  access_token      text unique not null,                 -- single-use candidate link (hashed in prod)
  token_expires_at  timestamptz not null,
  transcript        jsonb not null default '[]'::jsonb,   -- ordered turns (role, text, ts)
  code_snapshot     text not null default '',             -- last editor state
  code_runs         jsonb not null default '[]'::jsonb,   -- {lang, stdout, stderr, exit, ms} history
  evaluation_score  jsonb,                                -- deterministic scorecard (null until scored)
  scorecard_sent_at timestamptz,                          -- idempotency for notification
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index interviews_interviewer_idx on interviews (interviewer_id, created_at desc);
create index interviews_status_idx      on interviews (status);
create unique index interviews_token_idx on interviews (access_token);

-- Append-only event log: every FSM transition + LLM I/O. Full replay & audit.
create table interview_events (
  id            bigint generated always as identity primary key,
  interview_id  uuid not null references interviews(id) on delete cascade,
  seq           int  not null,                      -- monotonic per interview
  kind          text not null,                      -- 'transition'|'llm_in'|'llm_out'|'asr'|'tts'|'code_run'|'utterance'
  payload       jsonb not null,
  created_at    timestamptz not null default now(),
  unique (interview_id, seq)
);
create index interview_events_idx on interview_events (interview_id, seq);

-- Reliable interviewer notification (outbox pattern; retried by a worker).
create table notify_outbox (
  id            bigint generated always as identity primary key,
  interview_id  uuid not null references interviews(id) on delete cascade,
  kind          text not null default 'scorecard',
  status        text not null default 'pending',    -- 'pending'|'sent'|'failed'
  attempts      int  not null default 0,
  last_error    text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
```

**RLS (enabled on all three):**
- `interviews`: interviewer (`auth.uid() = interviewer_id`) has full access to own rows. Candidate access is **not** via RLS user identity (they may be anonymous) — candidates reach their interview through the backend, which validates `access_token` server-side. Frontend candidate realtime subscription uses a short-lived scoped token minted by the backend. No public table reads.
- `interview_events`, `notify_outbox`: **no client access** — service-role (backend) only.

**No in-DB `net.http_post` trigger.** The backend sets `status='scored'`, writes `evaluation_score`, and inserts a `notify_outbox` row in one transaction; a worker drains the outbox to Resend. (Decision A from alignment.)

---

## 3. Interview state machine (the core)

`interviewMachine.ts` — a typed, hand-rolled FSM. **No agent graph, no LangChain/LangGraph, no framework.**

```
GREETING                         AI introduces itself, builds rapport (voice)
  → ORAL_Q1 → ORAL_Q2 [→ ORAL_Q3]   experience-based oral questions (voice; configurable 2–3)
  → HANDOFF                        AI explains the coding phase, shares Q1
  → CODE_Q1                        candidate codes; AI polls code context silently
      → CODE_Q1_FOLLOWUP × (0..3)  depth gated by the oracle (see below)
  → CODE_Q2
      → CODE_Q2_FOLLOWUP × (0..3)
  → WRAP_UP                        AI closes the interview
  → SCORING                        deterministic pass (offline, ~seconds)
  → DONE
```

**Control-flow rules (code-owned, never the LLM):**
- Hard caps: ≤3 oral, exactly 2 core coding questions, ≤3 follow-ups each. Max turns bounded and known.
- A follow-up happens iff the **oracle** returns `{ follow_up: true }` AND the per-question counter `< 3`. Otherwise advance.
- Every state entry/exit writes an `interview_events` row. The machine can be rehydrated from `(interviews.fsm_state)` and replayed from `interview_events`.

**The LLM oracle contract** — the model is called for exactly two bounded jobs, both returning validated structured JSON (reject + retry on schema miss):

```ts
// 1) Produce the next thing the interviewer says.
generateUtterance(state, ctx) -> { text: string, expects: 'voice'|'text'|'code' }
// 2) Decide depth after an answer (bounded — cannot pick the next state).
evaluateAnswer(answer, code, ctx) -> { follow_up: boolean, reason: string, signal: 0..1 }
```

Latency posture: oral phase is conversational (voice round-trip). Coding phase, the backend **polls editor context on a debounce** and pre-builds the next prompt during natural pauses (Step 3 of your brief) so follow-ups feel instant.

---

## 4. Minimax integration (`minimax.ts`)

One client, three capabilities, **pinned in config** (`MINIMAX_LLM_MODEL`, `MINIMAX_VOICE_ID`):
- **LLM** (text→text): drives `generateUtterance` / `evaluateAnswer`. Prompt is voice-independent.
- **TTS** (text→audio): the interviewer's voice. Streamed to the client. Voice ID is cosmetic, pinned for persona stability.
- **ASR** (audio→text): candidate speech in the oral phase, with **barge-in** (client VAD interrupts TTS playback and opens the mic).
- **Degraded mode:** a latency watchdog; if voice round-trip exceeds threshold or the socket drops, flip the session to **chat-only** (`expects:'text'`) and continue without losing FSM state. (Decision: degrade now, full failover later.)
- All Minimax I/O logged to `interview_events` (`llm_in/llm_out/asr/tts`) for replay and cost accounting.

---

## 5. Auth (Supabase Auth, real this time)

- Providers (M1): **email+password, magic link, Google, GitHub** — all native Supabase Auth. SAML SSO deferred (needs Supabase Pro).
- **SSR session gating via Next middleware** (`@supabase/ssr`) — delete the no-op middleware and all `localStorage` auth. Protected: `/dashboard/*`. Public: `/`, `/auth/*`, `/interview/[id]` (token-gated, not user-gated).
- **Interviewer-invites-candidate:** interviewer creates an interview → backend mints a single-use `access_token` + expiry → candidate opens `/interview/[id]?t=…` (or a magic link) → backend validates token, no account required for the candidate in M1.
- Candidate T&C/indemnity acceptance captured at interview start (timestamp + version in `fsm_state`).

---

## 6. Frontend journey & design system

**Routes (final):** `/` (landing), `/auth/*`, `/dashboard` (+ scorecard view), `/interview/[id]`. Everything else deleted.

**`/interview/[id]` layout:** split pane — left: CodeMirror editor + terminal/output (Judge0 results); right: comms widget (AI avatar/state, transcript, mic/push-to-talk, chat fallback input). Real-time via WS + Supabase realtime on the interview row.

**Design system** (locked from alignment): monochrome-first — base `#0A0B0D`, surfaces `#141619`/`#1C1F25`, borders `#2A2E37`, text `#EAECEF`/`#9AA1AC`/`#5B616B`; single accent blue `#2F6BFF`, success `#34D399`, danger `#F2555A`. Geist + mono. GSAP motion 120–220ms, transforms/opacity only, ease `cubic-bezier(.2,.8,.2,1)`. Landing hero: one WebGL waveform/particle field (capped DPR, paused off-screen, `prefers-reduced-motion` static fallback). Explicit focus states; optimistic feedback; zero layout shift. 60fps or the effect is cut.

**Component purge:** collapse the 3× editors → 1, 3× chat panels → 1, 3× video panels → **0** (no video; voice only), 2× room interfaces → 1 interview screen, drop `parameter-selection`, `jd-upload`, `interface-switcher`, `admin-panel`(M1), `test-page`, `dot-grid-background`/`quantum-loading` unless reused. Delete the parallel Next.js `app/api/*` backend layer (login/register/room/rooms/sessions/parameter-selection/jd-upload/job-profiles) — orchestration lives on the VPS; keep only thin proxies if strictly needed.

---

## 7. Code execution (Service 2: Judge0)

- Self-host **Judge0** on the VPS (Docker), pre-warmed workers, network-isolated, CPU/mem/wall-time capped. No bespoke per-language containers.
- Backend exposes `POST /run { language, source, stdin }` → `{ stdout, stderr, exit_code, time_ms, memory_kb }`; appends to `interviews.code_runs`.
- Editor (CodeMirror) kept as-is; "Run" calls the backend, output streams to the terminal pane. `containerService`/`dockerService`/`productionContainerService`/`execution-router` deleted.
- (Web-preview is explicitly **out of scope**; clean seam left if ever needed.)

---

## 8. Post-scoring workflow

1. `SCORING` state runs `scoring.ts`: a deterministic pass over `transcript` + `code_runs` using a **pinned** Minimax call with a fixed rubric → structured `evaluation_score` JSON.
2. One transaction: write `evaluation_score`, set `status='scored'`, insert `notify_outbox(kind='scorecard')`.
3. Outbox worker (in Service 1) drains pending rows → Resend → sets `scorecard_sent_at` + `status='sent'`. Idempotent, retryable, observable.

---

## 9. CI/CD

- **Frontend → Vercel ← GitLab:** authorize Vercel's GitLab app once; auto prod-deploy on `main`, preview on MR. (Native; works on gitlab.com.)
- **Backend → Oracle VPS:** extend `.gitlab-ci.yml` with a `deploy` stage on `main`: build both service images → push to **GitLab Container Registry** → SSH to VPS → `docker compose pull && up -d`. Caddy reverse-proxy provides the deterministic public HTTPS endpoint.
- Existing CI (lint/test/build) stays green and gates the deploy.

---

## 10. The Slop Purge (delete / keep / repurpose)

**Backend — DELETE:** `ai_module/` (entire Python service); `living-ai-interviewer.js`, `problem-detector.js`, `approach-detector.js`, `approachPromptUtil.js`, `problemSolutionsService.js`, `question-templates.js`, `templateGeneratorService.js`, `advanced-nlp-processor.js`, `aiContentModerationService.js`, `jd-processing-service.js`, `job-profile-service.js`, `file-parser-service.js`, `containerService.js`, `dockerService.js`, `productionContainerService.js`, `execution-router.js`; routes `living-assessment.js`, `parameter-selection.js`, `job-profiles.js`, `jd-upload.js`, `solutions.js`, `session-containers.js`. Drop the `db/` questions-system schema (parameter-era).
**Backend — KEEP/REPURPOSE:** `judge0Service.js` → Service 2 client; `supabase-*` (session/user/realtime); `execute.js`; `sockets/` → the event bus; auth route → Supabase.
**Frontend — DELETE:** duplicate editors/chat/video, `parameter-selection`, `jd-upload-modal`, `interface-switcher`, `enhanced-*` variants, `test-page`, `admin-panel` (M1), the parallel `app/api/*` orchestration routes.
**Frontend — KEEP:** the CodeMirror editor core, `lib/supabase`, `lib/judge0` (point at backend), `components/ui/*` (shadcn primitives).

Net: backend services ~24 → ~8; frontend components de-duplicated ~40%; one fewer language/service.

---

## 11. Milestones

- **M1 — Skeleton + chat-coding interview (no voice).** New schema + RLS + migrations; Supabase auth + SSR gating + `/auth` overhaul; 2-service backend skeleton on VPS via CI/CD; `interviewMachine` with chat-only turns; CodeMirror + Judge0 run-and-capture; deterministic scoring + outbox email; `/dashboard` create+track+scorecard; `/interview/[id]` split-pane. Slop purge executed. **Acceptance:** an interviewer creates an interview, a candidate completes a full 2-question chat-coding interview end-to-end, code runs, a scorecard is produced and emailed — all state replayable from Supabase, CI green, deployed.
- **M2 — Voice.** Minimax TTS/ASR + barge-in in the oral phase; latency watchdog → chat degrade; landing hero + design-system polish pass.
- **M3 — Hardening & polish.** Load/latency tuning, observability, full design pass across dashboard/interview, accessibility.
- **M4 — Enterprise.** SAML SSO (Supabase Pro), candidate replay (premium), self-serve.

---

## 12. Open assumptions / risks

- Minimax provides LLM + TTS + ASR under one account with usable streaming latency; pinned model/voice IDs to be filled in config.
- Oracle VPS: assumed x86/ARM with Docker + KVM-capable for Judge0 isolation; specs to confirm at deploy.
- M1 is intentionally voice-free to de-risk; voice is additive and does not change the FSM or data model.
- Candidate indemnity handled via T&C acceptance at start (legal text provided by Amit).
```

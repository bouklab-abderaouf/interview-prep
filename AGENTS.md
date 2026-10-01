<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Interview Prep — Agent Operations & Development Guide

This guide is the single operational source of truth for AI agents (and human developers) working on `interview-prep`. It defines the architecture, hard quota constraints, established design patterns, and invariant rules learned through building and verifying Phases 0 through 6.

---

## 1. Project Overview & Architecture

`interview-prep` is a gamified, real-time voice interview trainer.
- **Core Loop**: Browser mic → Gemini Live API (native audio dialog) → browser speaker with sub-second barge-in interruption.
- **Data Flow**: CV upload (PDF) + Job Description (text) → Gemini Gap Analysis → 4-stage personalized roadmap with custom interviewers & question banks → Voice Interview Room → Turn capture in PostgreSQL → Deterministic speech metrics + Gemini Scorecard → XP, streaks, and stage unlocks.
- **Architecture Style**: Next.js 16 App Router with Route Handlers only (no standalone backend/proxy service). The browser speaks directly to Gemini Live over WebSocket using an ephemeral token minted server-side (`POST /api/live/token`).

### Current Status
- **Phase 0 (Walking Skeleton)**: AudioWorklet 16kHz capture, 24kHz scheduled playback, barge-in, TTFA metrics.
- **Phase 1 (Public Demo & Guardrails)**: `/demo`, Cloudflare Turnstile, IP/global rate limiting, fail-closed kill switch.
- **Phase 2 (Auth & Intake)**: Supabase magic-link auth, CV/JD ingestion, Gemini gap analysis, roadmap/stage generation.
- **Phase 3 (Turn Capture & Scoring)**: Per-turn transcript capture, deterministic speech metrics (WPM, filler words, talk ratio), Gemini scorecard grading, and recovery mechanisms.
- **Phase 4 (Gamified Progression)**: Serpentine skill tree, XP bar (500 XP/level), streak counter, stage detail sheet, database profile triggers.
- **Navigation Shell**: Persistent nav bar (Home, Interviews, Documents), back links, and interview history.
- **Phase 5 (Shipping, partly done)**: Failure cleanup, document/roadmap deletion APIs, interview status filters, interactive demo preview, AI disclosure, upload privacy notice, and `DELETE /api/account`. Still open from specs §9: demo reel, error monitoring, uptime check, three real preps.
- **Virtual Video Interview Room**: Audio-reactive 3D avatar (WebGL) + self-camera mirror practice feed with strictly decoupled camera/mic streams.
- **Phase 6 (Targeted Question Drill Mode)**: Rapid 2-minute drills on individual stage questions and CV gaps, dedicated `DRILL_ARC` with 1 follow-up probe, in-room drill HUD, and scaled XP scoring.
- **Hardening**: Vitest unit/route/component tests, Playwright browser tests with axe scans, GitHub Actions CI (all zero-quota — `docs/TESTING.md`); interview deletion; `/interviews` rebuilt; viewer-local times; System/Light/Dark theme; sign-in page that explains failed links; WCAG AA contrast in dark mode.

---

## 2. Hard Quota Realities & Operational Constraints (CRITICAL)

The project operates under strict Gemini API constraints on the free tier:

### The Free Tier Quotas
1. **Gemini Text Model**: Limited to **20 requests/model/day** (`generate_content_free_tier_requests`).
2. **Gemini Live API**: Highly constrained concurrent and daily session capacity. Quota exhaustion causes:
   - Silent drop-outs (WebSocket remains open, but model produces no text/audio output; handled by a 12s response watchdog).
   - Abrupt WebSocket close with code `1011` (`You exceeded your current quota`).

### Rules for AI Agents
- **NEVER perform speculative Live API sessions or text calls**: Every test that connects to Gemini Live or calls `/api/sessions/[id]/score` or `/api/analyze` spends scarce daily quota.
- **Do NOT automate UI clicks on quota-burning buttons**: Never click "Start" in the interview room, "Score it", or submit onboarding forms in browser sessions without explicit user approval.
- **Verify offline first**:
  - Run `npm run check` (typecheck + lint + unit/component tests) — zero quota, ~15s.
  - Run `npm run test:e2e` for the browser suite — it builds with placeholder credentials and fails any test whose page requests `/api/live/token`, `/api/analyze`, a `/score` route or Gemini.
  - Inspect PostgreSQL state directly (read queries via Supabase client or CLI).
  - Use fixtures (`lib/fixtures/`) and mock data for UI testing.
  - Review network logs and error logs before re-attempting failed requests.

### Model Fallback (`lib/gemini/retry.ts`)
Free-tier quotas are **per model** (e.g. `gemini-3.6-flash` 5 RPM / 20 RPD, `gemini-3.5-flash-lite` 15 RPM / 500 RPD), and 503 "high demand" refusals are still counted against them. Every text call goes through `withModelFallback(textModels(), ...)`: `GEMINI_TEXT_MODEL` first, then the optional `GEMINI_TEXT_FALLBACK_MODEL`. A 503 is retried briefly on the same model, a 429 moves to the next model at once, and any other error throws. The complexity budget below was bisected against one model — a fallback model may reject a schema the primary accepts, so verify a new fallback against the live API.

### Structured Output Complexity Budget
Gemini's structured output engine (`responseJsonSchema`) has an undocumented depth/breadth complexity limit:
- Schemas with deeply nested arrays (e.g., 3 levels deep like `stages[].questions[].follow_ups[]`) alongside broad top-level objects trigger a generic `400 INVALID_ARGUMENT`.
- **The Pattern**: In `lib/gemini/analyze-gap.ts`, gap analysis is split into two calls:
  1. Primary call with inline PDF CV + text JD (omits `follow_ups`).
  2. Cheap text-only call for `follow_ups`, which are then merged in TypeScript.
- `Scorecard` in `lib/gemini/score-session.ts` remains a single call because its schema is shallow.
- **Rule**: Do NOT add deeply nested structures to Gemini JSON schemas without verifying against the live API.

---

## 3. Core Architectural Invariants (Do Not Break)

### A. Microphone Acquisition Before Token Minting
- **Invariant**: The user's microphone must be granted via `requestMicrophone()` (`lib/audio/mic.ts`) **before** calling `POST /api/live/token` and before opening the Live WebSocket.
- **Why**: Previously, the app minted a token and opened the socket before calling `getUserMedia`. If the mic was blocked, a Live session was burned from the free-tier quota before immediately throwing `NotAllowedError`.
- **Echo Cancellation**: `MIC_CONSTRAINTS` in `lib/audio/mic.ts` must always have `echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true`, and `channelCount: 1` to prevent laptop speakers from echoing the AI's voice back into the mic.

### B. Natural Interview Arc & Handling Non-Answers
- **The Arc (`lib/prompts/interviewer.ts`)**:
  1. Greet, introduce persona/role, explain format, invite candidate to introduce themselves in their own words (Turn 1 asks **zero** question bank questions).
  2. Follow up on what the candidate actually said in their intro.
  3. Work into core focus area questions.
  4. Reserve uncomfortable CV gap/risk questions (dates, missing tech) for the second half.
- **Non-Answers**: If candidate says something empty or evasive (e.g. "Bonjour, bonjour"), the model is explicitly instructed to call it out and re-ask, never accepting it with "D'accord, je vois".
- **Question Bank Generation (`lib/prompts/gap-analysis.ts`)**: The stage question bank array must be ordered: broad opener first, CV-pointed middle, uncomfortable gap/risk questions last.

### C. Turn Capture & Scoring Resilience
- **Turn Capture (`lib/live/turn-timeline.ts`)**:
  - **Timing comes from audio, never from transcription arrival.** The candidate's input transcription arrives late (as the interviewer starts replying); stamping turns by arrival made every pause negative and pace/talk ratio fiction. Candidate spans come from the local energy VAD; interviewer spans from the player's scheduled playback start/end (`enqueue()` return value, `playbackEndsAt()`), cut at `interrupted`.
  - A finished answer is frozen when the reply starts and committed when the reply ends, once its transcription has arrived. `snapshot()` includes in-flight turns for periodic/tab-close flushes.
  - Pre-fix sessions are detected by overlapping turns (`timingIsReliable` in `lib/metrics/assessment.ts`); the scorecard hides timing metrics for them.
  - Flushes to PostgreSQL via `PATCH /api/sessions/[id]` periodically (60s timer), on session stop, and on tab close via `fetch(..., { keepalive: true })` (not `sendBeacon`, which cannot send PATCH).
- **Idempotent Scoring (`app/api/sessions/[id]/score/route.ts`)**:
  - Turns are saved before scoring runs.
  - If already scored, returns existing `scorecardId` with `{ alreadyScored: true }`.
  - Concurrency-safe: If two requests race to insert a scorecard, the unique constraint on `scorecards.session_id` catches the collision, and the loser re-reads and returns the winner's scorecard rather than throwing 502.
  - Uses `withModelFallback(textModels(), ..., { attemptsPerModel: 3, baseDelayMs: 3000 })` in `lib/gemini/retry.ts` to weather transient 503 "high demand" bursts without failing an 11-minute interview.
  - UI offers manual retry (`ScoreSessionButton`) on `/session/[id]` and in `/interviews`.

### D. Supabase Auth & RLS Policies
- **Next.js 16 Proxy**: Session refresh and route guarding live in `proxy.ts` (Next.js 16 convention replacing `middleware.ts`).
- **Cryptographic Guard**: Always authenticate via `supabase.auth.getClaims()` on the server, **never** `getSession()` (which is unverified).
- **Client Scopes**:
  - `lib/supabase/server.ts`: User-scoped client (respects RLS) for Server Components and Route Handlers.
  - `lib/supabase/client.ts`: Browser client.
  - `lib/supabase/admin.ts`: Service-role client (bypasses RLS); strictly restricted to anonymous demo sessions, `usage_counters` (which has no RLS policies by design), and `auth.admin.deleteUser` in `DELETE /api/account` (the user id always comes from verified claims, never the request).
- **Required Policies & Triggers**:
  - Migration `005_write_policies.sql`: Grants INSERT policies on `stages` and `scorecards` for authenticated users owning the parent roadmap/session.
  - Migration `006_profiles_autocreate.sql`: Uses a `SECURITY DEFINER` trigger on `auth.users` (`handle_new_user()`) to automatically create `profiles` rows upon signup.

### E. Navigation & Progression State
- **Server-Driven Progression**: Skill tree nodes, XP, streaks, and stage locks are read per request from Postgres (`stages`, `progress`, `profiles`). There is no client-side game state.
- **Explicit Back Navigation**: Always use explicit destinations (e.g. `<BackLink href="/roadmap/[id]" label="← Back to Roadmap" />`), never `router.back()`. Scorecards can be reached both from interview history and via redirection after an interview, where going "back" lands on an inactive session.
- **Mid-Interview Locking**: Navigational links are disabled during an active interview session; candidate must click "Stop" to flush turns and grade cleanly.

### F. Virtual Interview Room & Webcam Decoupling
- **Decoupled Media Streams**: Microphone acquisition is strictly managed by `requestMicrophone()` (`lib/audio/mic.ts`). The self-camera mirror feed (`VideoMirror.tsx`) requests `{ video: true, audio: false }` independently.
- **Why**: Denying webcam permission, toggling camera off, or camera hardware failures must NEVER block the voice interview or abort the WebSocket connection.
- **Client-Only Three.js**: Three.js WebGL canvas in `Avatar3D.tsx` runs strictly client-side with animation frames cancelled and geometries/materials properly disposed on unmount to prevent WebGL context leaks across routes.

### G. Targeted Question Drill Mode & Prompt Arc
- **Targeted Drill Arc**: In `lib/prompts/interviewer.ts`, drills bypass the standard multi-stage interview arc and use `DRILL_ARC`: the interviewer introduces the specific question directly on Turn 1, evaluates candidate depth, and asks at most 1 sharp follow-up probe before concluding.
- **Session Metadata**: Drills are stored as `sessions.usage = { drill: true, targetQuestion, targets, questionIndex }`, avoiding schema migrations or RLS check alterations while preserving full compatibility with turn capture and scoring pipelines.
- **Scaled XP**: Drills award scaled XP (15–40 XP from the overall score, plus the duration bonus) to encourage focused daily question practice without distorting level progression.
- **Drills never write `progress`**: In `app/api/sessions/[id]/score/route.ts`, only full interviews call `recordStageProgress`. A drill scores one question, so it must not set a stage's `best_score`/`stars`/`attempts` or unlock the next stage — it once did, letting a single 2-minute answer skip a whole stage.

### H. AI Disclosure & User Data
- **AI Disclosure (specs §9, EU AI Act Art. 50)**: Every entry point to a Live session must say the candidate is speaking with an AI *before* the session starts — `MicPermissionGate` for `/demo`, the idle banner in `InterviewRoom` for `/session/[id]`. The interviewer tile keeps a permanent "AI" label, and `AI_DISCLOSURE` in `lib/prompts/interviewer.ts` forbids the persona from claiming to be human. A new session entry point needs the same notice.
- **Account Deletion (`app/api/account/route.ts`)**: Every user-owned table cascades from `auth.users`, so deleting the auth user removes all rows. Storage has no cascade: the user's `cvs/{userId}/` folder is emptied first, and if that fails the account is left intact. A new user-owned table must reference `auth.users` (directly or through a parent) `on delete cascade`; a new storage bucket must be cleared in this route.
- **Interview Deletion (`DELETE /api/sessions/[id]`, bulk `DELETE /api/sessions`)**: Scoped by RLS *and* an explicit `user_id` filter. Turns and the scorecard cascade; `profiles` XP and `progress` are left alone on purpose — recomputing them from what's left would let a deletion re-lock a stage.

### I. Time, Theme & Session State Display
- **Displayed times go through `<LocalTime>`** (`components/ui/LocalTime.tsx`), or `formatInstant(iso, style, timeZone)` with `useHydrated()` inside client components. They render UTC on the server and during hydration, then the viewer's zone. Never format a user-facing time in the server's zone or in plain UTC — UTC showed a 20:10 Paris interview as 18:10.
- **Theme** (`lib/theme.ts`): the choice is a `theme` cookie read by the root layout, which renders `class="light|dark"` on `<html>`; no class means follow the system. The `dark` variant in `app/globals.css` encodes that, so plain `dark:` utilities just work. Don't add an inline theme script or localStorage theme state.
- **Grey text needs a dark pair**: `text-zinc-500` alone is 4.1:1 on the dark background (fails WCAG AA). Write `text-zinc-500 dark:text-zinc-400`. The axe scans in `e2e/` fail the run on serious contrast violations.
- **Session state comes from what happened, not `sessions.status`** (`lib/interviews.ts`): a row is created when the interview room opens, so "active" with no turns and older than 30 minutes is "not started", not in progress.

---

## 4. Codebase Directory Map

```text
interview-prep/
├── app/
│   ├── (app)/                   # Authenticated application routes
│   │   ├── documents/           # Uploaded CVs (signed URLs) & JDs, plus "Your data" / account deletion
│   │   ├── home/                # Main hub: roadmaps, stage progress, recent interviews
│   │   ├── interviews/          # History of all sessions with scores & "Score it" retry
│   │   ├── onboarding/          # CV upload + JD intake wizard
│   │   ├── roadmap/[roadmapId]/ # Gamified serpentine skill tree & stage modal
│   │   ├── scorecard/[id]/      # Detailed scorecard (STAR, metrics, quotes, model answers)
│   │   ├── session/[id]/        # Live voice interview room (or Phase 0 connectivity test)
│   │   └── layout.tsx           # App shell wrapping authenticated pages with AppNav
│   ├── (marketing)/             # Public landing page, /sample-scorecard, /demo, /sign-in
│   ├── api/
│   │   ├── account/             # DELETE: full account deletion (storage, then auth user)
│   │   ├── analyze/             # Gap analysis & roadmap generator (PDF CV + text JD)
│   │   ├── demo/                # Guardrailed token generator for public demo
│   │   ├── documents/[id]/      # DELETE: unlinked document (+ stored CV)
│   │   ├── live/token/          # Ephemeral token minter for authenticated interviews
│   │   ├── roadmaps/[id]/       # DELETE: roadmap, its sessions, and unshared documents
│   │   ├── sessions/            # POST: create a full or drill session; DELETE: bulk delete ({ ids })
│   │   └── sessions/[id]/       # Turn flushing (PATCH), DELETE, & session scoring (POST /score)
│   ├── auth/                    # Magic-link confirm (/auth/confirm) and sign-out
│   ├── layout.tsx               # Root HTML layout, fonts & server-rendered theme class
│   └── globals.css              # Tailwind CSS imports & global design tokens
├── components/
│   ├── auth/                    # SignInForm, link-errors (why a magic link failed)
│   ├── interview/               # Interview room, history list & stats, ScoreSessionButton
│   ├── nav/                     # AppNav header and BackLink component
│   ├── onboarding/              # File dropzone & JD text area
│   ├── roadmap/                 # SkillTree, StageNode, StartStageButton, XpBar
│   ├── scorecard/               # Pass meter, score bars, per-question, delivery, transcript
│   └── ui/                      # LocalTime, ThemeToggle, delete buttons
├── lib/
│   ├── audio/                   # mic.ts, recorder.ts, player.ts, resample.ts
│   ├── fixtures/                # Demo scenario and sample scorecard fixtures
│   ├── gemini/                  # analyze-gap.ts, score-session.ts, schemas.ts, retry.ts
│   ├── guardrails/              # kill-switch.ts, rate-limit.ts, turnstile.ts
│   ├── live/                    # WebSocket client, config builder, types
│   ├── metrics/                 # deterministic.ts (WPM, pauses, filler words), filler-words.ts
│   ├── prompts/                 # interviewer.ts, gap-analysis.ts, scoring.ts
│   ├── supabase/                # server.ts, client.ts, admin.ts, proxy.ts
│   ├── hooks/use-hydrated.ts    # false during SSR/hydration, true after
│   ├── format.ts                # formatInstant (zone-aware), duration formatters
│   ├── interviews.ts            # Session state, history stats, day grouping (pure)
│   ├── progression.ts           # XP, stars, streaks (pure; clock is a parameter)
│   └── theme.ts / theme-server.ts # Theme cookie parsing & server read
├── public/
│   └── worklets/
│       └── capture-processor.js # Static AudioWorklet (downsamples to 16kHz PCM16)
├── supabase/
│   └── migrations/              # 001_init to 007_scorecard_per_question
├── tests/                       # Vitest setup & fake-supabase.ts (records every query)
├── e2e/                         # Playwright specs; fixtures.ts guards against quota-burning requests
├── docs/TESTING.md              # What each test layer covers and how to write one
├── .github/workflows/ci.yml     # check + browser tests on every push/PR (no secrets)
├── proxy.ts                     # Next.js 16 proxy convention (session refresh & auth guard)
└── package.json
```

---

## 5. Development, Verification & Testing Workflow

### Common Commands
```bash
# Run local dev server
npm run dev

# Typecheck + lint + unit/component tests (zero quota, ~15s — run often!)
npm run check

# Unit/component tests only, or on every save
npm run test
npm run test:watch

# Browser tests against an isolated production build (zero quota, ~1.5 min)
npm run test:e2e

# Production build check
npm run build
```

### Verification Checklist Before Committing Changes
1. **Did you add a Live API or Gemini call?**
   - Confirm it cannot be triggered on page load or by a blocked mic.
   - Confirm it goes through `withModelFallback(textModels(), ...)`: 503 retries then falls back, 429 falls back immediately (free-tier quotas are per model), anything else throws.
   - Confirm structured output schemas remain shallow or use the two-call split.
2. **Did you edit database queries?**
   - Confirm RLS policies allow the operation (check `supabase/migrations/`).
   - Use session client (`createClient()`) for user actions; never leak service-role client to user flows.
3. **Did you modify audio capture/playback?**
   - Ensure `requestMicrophone()` precedes token acquisition.
   - Verify AudioContexts are closed/cleaned up on component unmount.
4. **Did you add a page or route?**
   - Ensure explicit back navigation exists.
   - Add the route to `AppNav` if it belongs in the top-level user shell.
   - Show times with `<LocalTime>` (UTC on the server, the viewer's zone after hydration), never in the server's zone.
   - Pair every `text-zinc-500` with `dark:text-zinc-400`, and give the page an `<h1>`.
5. **Did you add or change logic?**
   - Add a test in the layer that fits (`docs/TESTING.md`): pure logic in `lib/**/*.test.ts`, route handlers against `tests/helpers/fake-supabase.ts`, UI with Testing Library, signed-out flows in `e2e/`.
   - `npm run check` passes; run `npm run test:e2e` before pushing.

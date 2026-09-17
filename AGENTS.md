<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Interview Prep — Agent Operations & Development Guide

This guide is the single operational source of truth for AI agents (and human developers) working on `interview-prep`. It defines the architecture, hard quota constraints, established design patterns, and invariant rules learned through building and verifying Phases 0 through 4.

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
- **Phase 5 (Shipping)**: Failure cleanup, document/roadmap deletion APIs, interview status filters, and interactive demo preview.
- **Virtual Video Interview Room**: Audio-reactive 3D avatar (WebGL) + self-camera mirror practice feed with strictly decoupled camera/mic streams.
- **Phase 6 (Targeted Question Drill Mode)**: Rapid 2-minute drills on individual stage questions and CV gaps, dedicated `DRILL_ARC` with 1 follow-up probe, in-room drill HUD, and scaled XP scoring.

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
  - Use `npx tsc --noEmit` and `npm run lint` for static correctness.
  - Inspect PostgreSQL state directly (read queries via Supabase client or CLI).
  - Use fixtures (`lib/fixtures/`) and mock data for UI testing.
  - Review network logs and error logs before re-attempting failed requests.

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
- **Turn Capture**:
  - Concatenates delta transcriptions (`inputAudioTranscription`/`outputAudioTranscription`).
  - Commits turns based on candidate activity-end and assistant `turnComplete` (not the unreliable transcription `finished` flag).
  - Flushes to PostgreSQL via `PATCH /api/sessions/[id]` periodically (60s timer), on session stop, and on tab close via `fetch(..., { keepalive: true })` (not `sendBeacon`, which cannot send PATCH).
- **Idempotent Scoring (`app/api/sessions/[id]/score/route.ts`)**:
  - Turns are saved before scoring runs.
  - If already scored, returns existing `scorecardId` with `{ alreadyScored: true }`.
  - Concurrency-safe: If two requests race to insert a scorecard, the unique constraint on `scorecards.session_id` catches the collision, and the loser re-reads and returns the winner's scorecard rather than throwing 502.
  - Uses `withRetry(..., 4, 3000)` in `lib/gemini/retry.ts` to weather transient 503 "high demand" bursts without failing an 11-minute interview.
  - UI offers manual retry (`ScoreSessionButton`) on `/session/[id]` and in `/interviews`.

### D. Supabase Auth & RLS Policies
- **Next.js 16 Proxy**: Session refresh and route guarding live in `proxy.ts` (Next.js 16 convention replacing `middleware.ts`).
- **Cryptographic Guard**: Always authenticate via `supabase.auth.getClaims()` on the server, **never** `getSession()` (which is unverified).
- **Client Scopes**:
  - `lib/supabase/server.ts`: User-scoped client (respects RLS) for Server Components and Route Handlers.
  - `lib/supabase/client.ts`: Browser client.
  - `lib/supabase/admin.ts`: Service-role client (bypasses RLS); strictly restricted to anonymous demo sessions and `usage_counters` (which has no RLS policies by design).
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
- **Scaled XP**: Drills award scaled XP (+15 to +40 XP based on overall performance and duration) to encourage focused daily question practice without distorting level progression.

---

## 4. Codebase Directory Map

```text
interview-prep/
├── app/
│   ├── (app)/                   # Authenticated application routes
│   │   ├── documents/           # List of uploaded CVs (signed URLs) & JDs
│   │   ├── home/                # Main hub: roadmaps, stage progress, recent interviews
│   │   ├── interviews/          # History of all sessions with scores & "Score it" retry
│   │   ├── onboarding/          # CV upload + JD intake wizard
│   │   ├── roadmap/[roadmapId]/ # Gamified serpentine skill tree & stage modal
│   │   ├── scorecard/[id]/      # Detailed scorecard (STAR, metrics, quotes, model answers)
│   │   ├── session/[id]/        # Live voice interview room (or Phase 0 connectivity test)
│   │   └── layout.tsx           # App shell wrapping authenticated pages with AppNav
│   ├── (marketing)/             # Public landing page & /sample-scorecard
│   ├── api/
│   │   ├── analyze/             # Gap analysis & roadmap generator (PDF CV + text JD)
│   │   ├── demo/                # Guardrailed token generator for public demo
│   │   ├── live/token/          # Ephemeral token minter for authenticated interviews
│   │   └── sessions/[id]/       # Turn flushing (PATCH) & session scoring (POST /score)
│   ├── auth/                    # Magic-link confirm (/auth/confirm) and sign-out
│   ├── demo/                    # Public 2-minute guarded interview demo
│   ├── sign-in/                 # Passwordless email sign-in screen
│   ├── layout.tsx               # Root HTML layout & fonts
│   └── globals.css              # Tailwind CSS imports & global design tokens
├── components/
│   ├── interview/               # Audio visualizer, timer, transcript feed, ScoreSessionButton
│   ├── nav/                     # AppNav header and BackLink component
│   ├── onboarding/              # File dropzone & JD text area
│   ├── roadmap/                 # SkillTree, StageNode, StartStageButton, XpBar
│   ├── scorecard/               # STAR breakdown, radar charts, communication metrics
│   └── ui/                      # Shared buttons, dialogs, badges
├── lib/
│   ├── audio/                   # mic.ts, recorder.ts, player.ts, resample.ts
│   ├── fixtures/                # Demo scenario and sample scorecard fixtures
│   ├── gemini/                  # analyze-gap.ts, score-session.ts, schemas.ts, retry.ts
│   ├── guardrails/              # kill-switch.ts, rate-limit.ts, turnstile.ts
│   ├── live/                    # WebSocket client, config builder, types
│   ├── metrics/                 # deterministic.ts (WPM, pauses, filler words), filler-words.ts
│   ├── prompts/                 # interviewer.ts, gap-analysis.ts, scoring.ts
│   ├── supabase/                # server.ts, client.ts, admin.ts, proxy.ts
│   └── format.ts                # UTC date/time & duration formatters for SSR
├── public/
│   └── worklets/
│       └── capture-processor.js # Static AudioWorklet (downsamples to 16kHz PCM16)
├── supabase/
│   └── migrations/              # 001_init to 006_profiles_autocreate
├── proxy.ts                     # Next.js 16 proxy convention (session refresh & auth guard)
└── package.json
```

---

## 5. Development, Verification & Testing Workflow

### Common Commands
```bash
# Run local dev server
npm run dev

# Static type checking (Zero quota cost - run often!)
npx tsc --noEmit

# Linting
npm run lint

# Production build check
npm run build
```

### Verification Checklist Before Committing Changes
1. **Did you add a Live API or Gemini call?**
   - Confirm it cannot be triggered on page load or by a blocked mic.
   - Confirm it handles 503 retry gracefully via `withRetry`.
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
   - Ensure server components format dates using `lib/format.ts` (fixed UTC) to prevent hydration mismatches.

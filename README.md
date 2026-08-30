# Interview Prep

A gamified, real-time voice interview trainer. You talk, an AI interviewer
talks back — live, with barge-in — and (eventually) you get a scorecard
built from your own CV and the job you're targeting.

Two audiences: a recruiter skimming for 90 seconds, and the author, using it
for actual interview prep.

## Status

**Phase 0** (voice loop walking skeleton) and **Phase 1** (public demo +
guardrails) are built and verified end-to-end against a live Gemini Live API
session and a real Supabase project. Phases 2–5 — CV/JD intake and gap
analysis, transcripts and scorecards, the gamified roadmap, and shipping —
are not built yet. See [Roadmap](#roadmap) below.

## What's here right now

- **A real-time voice interview.** Browser mic → Gemini Live (native
  audio-dialog model) → browser speaker, with sub-second barge-in
  interruption and TTFA (time-to-first-audio) instrumentation.
- **A public, guardrailed demo.** Cloudflare Turnstile bot-check, per-IP and
  global daily rate limits, and a kill switch — all enforced server-side,
  fail-closed, before an ephemeral Gemini token is ever minted.
- **A full Postgres schema** (Supabase), RLS enabled on every table from the
  first migration, not retrofitted.

## Architecture

- **Next.js 16, App Router, Route Handlers only.** No separate backend
  service — the only reason one would traditionally exist here is proxying
  audio, and the browser talks to Gemini Live directly instead.
- **Audio pipeline.** A real `AudioWorklet` (must be a static file — it can't
  be a bundled module) downsamples the mic's native rate to 16kHz PCM16 in
  ~100ms chunks. Playback is a separate 24kHz `AudioContext` with a
  scheduled-queue player, not `<audio>` or `MediaRecorder`.
- **Voice model.** The browser connects to Gemini Live directly using a
  short-lived ephemeral token minted server-side
  (`POST /api/live/token`) — the real `GEMINI_API_KEY` never reaches the
  client. The interviewer's system instruction, model, and every other
  session config field are baked into the token itself
  (`lockAdditionalFields: []`), so a client can't override the prompt from
  devtools.
- **Database.** Supabase/Postgres. `usage_counters` is RLS-enabled with *no*
  policies by design — it's touched exclusively by the service-role client.
- **Guardrails.** Kill switch → global daily cap → per-IP hourly cap →
  Turnstile → record session, in that order, all server-side, all
  fail-closed on error.

## Key decisions (and why)

| Decision | Choice | Reason |
|---|---|---|
| Audio transport | Browser → Gemini Live directly, ephemeral token | No media-proxy service to build or run |
| Backend | Next.js Route Handlers only | One deploy target |
| TTFA measurement | Server signal when available, local energy-based fallback otherwise | Gemini's `voiceActivityDetectionSignal` is allowlist-gated and not available on every project |
| Live model | Verify against `models.list` before deploying | Live model IDs churn — this repo has already hit one rename mid-build |

## Setup

```bash
npm install
cp .env.local.example .env.local
```

Fill in `.env.local`:

- **`GEMINI_API_KEY`** — from [AI Studio](https://aistudio.google.com).
  Confirm the billing tier before pointing this at anything containing a
  real CV — on the free tier, input may be used for model training.
- **`GEMINI_LIVE_MODEL`** — verify the current value against a live
  `models.list` call for your account. Model availability varies by project
  and changes over time.
- **`NEXT_PUBLIC_SUPABASE_URL`**, **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**,
  **`SUPABASE_SERVICE_ROLE_KEY`** — from your Supabase project's API
  settings. Apply the migrations in `supabase/migrations/` in order.
- **`TURNSTILE_SECRET_KEY`**, **`NEXT_PUBLIC_TURNSTILE_SITE_KEY`** — from the
  [Cloudflare Turnstile dashboard](https://dash.cloudflare.com). Required
  for the `/demo` guardrails; without them the demo fails closed rather than
  letting traffic through unverified.
- **`IP_HASH_SALT`** — any random string. Not from the original spec's env
  list verbatim, but required to compute `sessions.ip_hash`.

```bash
npm run dev
```

- `/session/[id]` — a manual, unguarded connectivity test for the voice
  loop (`mode: 'full'`). Displays live TTFA/median/p90.
- `/demo` — the real public flow: language toggle, Turnstile, mic
  permission, a 2-minute countdown.

## Known gaps and risks

- **No auth yet.** `mode: 'full'` session requests have no guard until
  Phase 2 adds one — right now they're only reachable by knowing the
  endpoint, not by anyone browsing the deployed site.
- **TTFA's local fallback is a heuristic, not ground truth.** It infers
  end-of-speech from mic energy dropping for ~800ms, mirroring the server's
  own `silenceDurationMs` — useful for a sanity check, not a rigorous
  benchmark, until the project is allowlisted for the real
  `voiceActivityDetectionSignal`.
- **The demo reel and GitHub link on the landing page are placeholders.**
  The reel is recorded once Phase 3's scorecards exist to show off; the
  repo link needs to be filled in by hand.

## Roadmap

- [x] Phase 0 — voice loop walking skeleton
- [x] Phase 1 — public demo + guardrails
- [ ] Phase 2 — CV/JD intake and gap analysis
- [ ] Phase 3 — transcripts and scorecards
- [ ] Phase 4 — gamified roadmap
- [ ] Phase 5 — ship

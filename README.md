# Interview Prep

A gamified, real-time voice interview trainer. You talk, an AI interviewer
talks back — live, with barge-in — and (eventually) you get a scorecard
built from your own CV and the job you're targeting.

Two audiences: a recruiter skimming for 90 seconds, and the author, using it
for actual interview prep.

## Status

**Phase 0** (voice loop walking skeleton) and **Phase 1** (public demo +
guardrails) are built and verified end-to-end against a live Gemini Live API
session and a real Supabase project.

**Phase 2** (auth, CV/JD intake, gap analysis) and **Phase 3** (turn capture,
deterministic metrics, Gemini scoring, scorecard UI) are built. Both share
the same verification gap: the two Gemini calls behind `/api/analyze` and
the full scoring pipeline are each independently confirmed against the real
API, and the scorecard UI is confirmed rendering correctly end-to-end via
the static `/sample-scorecard` page — but the full authenticated chain
(sign in → upload a CV → run a real interview → get scored) hasn't run
start-to-finish yet. See [Known gaps and risks](#known-gaps-and-risks).

Phases 4–5 — the gamified roadmap and shipping — are not built yet. See
[Roadmap](#roadmap) below.

## What's here right now

- **A real-time voice interview.** Browser mic → Gemini Live (native
  audio-dialog model) → browser speaker, with sub-second barge-in
  interruption and TTFA (time-to-first-audio) instrumentation.
- **A public, guardrailed demo.** Cloudflare Turnstile bot-check, per-IP and
  global daily rate limits, and a kill switch — all enforced server-side,
  fail-closed, before an ephemeral Gemini token is ever minted.
- **Magic-link auth** (Supabase) gating the authenticated app routes.
- **CV/JD intake and gap analysis.** Upload a CV, paste a job description,
  get back structured candidate/role/gap data and 4 interview stages with
  question banks — built from the CV's actual content, not a template.
- **Real stage-driven interviews.** Once a roadmap exists, `/session/[id]`
  runs an authenticated, gated interview built from that stage's actual
  persona and question bank, captures the transcript with per-turn
  timestamps, and scores it into a scorecard on completion — STAR
  breakdown, deterministic communication metrics, grounded strengths and
  improvements, model answers, and XP/stage-unlock progression.
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
  Everything else (documents, roadmaps, stages, progress) goes through the
  session-scoped client instead, so RLS enforces per-user access — the
  service-role client is only for Phase 1's anonymous demo sessions.
- **Guardrails.** Kill switch → global daily cap → per-IP hourly cap →
  Turnstile → record session, in that order, all server-side, all
  fail-closed on error.
- **Auth.** Supabase magic-link (passwordless email). Next.js 16 renamed
  `middleware.ts` to `proxy.ts` — session refresh and the route guard live
  there. `getClaims()`, not `getSession()`, gates access: the latter's user
  object isn't cryptographically verified server-side.
- **Gap analysis.** One Gemini call with the CV as an inline PDF part plus
  the JD as text, structured output via a JSON schema derived from Zod
  (`zod`'s native `toJSONSchema`). One exception: Gemini's structured output
  has an undocumented complexity budget that the full schema exceeds when
  `stages[].questions[].follow_ups[]` is included alongside the rest —
  confirmed by bisecting against the live API. That one field is generated
  in a second, cheap, text-only call and merged in — see the comment in
  `lib/gemini/analyze-gap.ts` for the full story.
- **Turn capture.** `inputAudioTranscription`/`outputAudioTranscription`
  arrive as incremental deltas, not full turn text — concatenated per-role
  until the server marks a turn `finished`, timestamped relative to session
  start. Flushed to Postgres on a 60s safety timer, on session end, and on
  tab close via `fetch(..., {keepalive: true})` — not
  `navigator.sendBeacon`, which is POST-only and can't carry the PATCH this
  needs.
- **Scoring.** One Gemini call — transcript, stage focus areas/question
  bank, roadmap gaps, and the deterministic metrics (commented on, never
  recomputed by the model) in; a Scorecard out. `Scorecard` is shallow
  enough (no array nested inside another array) that it doesn't hit the
  complexity budget `GapAnalysis` does, so this one stays a single call as
  specced. Every strength's quote is checked against the actual transcript
  and dropped if it isn't verbatim.

## Key decisions (and why)

| Decision | Choice | Reason |
|---|---|---|
| Audio transport | Browser → Gemini Live directly, ephemeral token | No media-proxy service to build or run |
| Backend | Next.js Route Handlers only | One deploy target |
| TTFA measurement | Server signal when available, local energy-based fallback otherwise | Gemini's `voiceActivityDetectionSignal` is allowlist-gated and not available on every project |
| Live model | Verify against `models.list` before deploying | Live model IDs churn — this repo has already hit one rename mid-build |
| `GEMINI_API_KEY` billing tier | Stayed on free tier; added a notice instead | The spec's own fallback option — see [Known gaps and risks](#known-gaps-and-risks) |
| Gap-analysis output | Two Gemini calls (primary + follow-ups), not one | The spec calls for one call, but the full schema exceeds Gemini's structured-output complexity budget — see Architecture above |
| XP duration bonus | 1 XP per minute spent | The spec names `duration_bonus` in its XP formula without defining it — this is a documented reading, not a literal spec value |
| Turn flush on tab close | `fetch(..., {keepalive: true})`, not `navigator.sendBeacon` | sendBeacon is POST-only; flushing turns needs PATCH |

## Setup

```bash
npm install
cp .env.local.example .env.local
```

Fill in `.env.local`:

- **`GEMINI_API_KEY`** — from [AI Studio](https://aistudio.google.com).
  Confirm the billing tier before pointing this at anything containing a
  real CV — on the free tier, input may be used for model training, and
  this repo's own key is confirmed running on it (20 requests/model/day).
  Enable paid billing to remove both the data-usage risk and the cap, or
  leave the onboarding page's notice in place if you don't.
- **`GEMINI_LIVE_MODEL`**, **`GEMINI_TEXT_MODEL`** — verify both current
  values against a live `models.list` call for your account before relying
  on the checked-in defaults. Model availability varies by project and
  changes over time; this repo has already hit both mid-build.
- **`NEXT_PUBLIC_SUPABASE_URL`**, **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**,
  **`SUPABASE_SERVICE_ROLE_KEY`** — from your Supabase project's API
  settings. Apply the migrations in `supabase/migrations/` in order.
- **`TURNSTILE_SECRET_KEY`**, **`NEXT_PUBLIC_TURNSTILE_SITE_KEY`** — from the
  [Cloudflare Turnstile dashboard](https://dash.cloudflare.com). Required
  for the `/demo` guardrails; without them the demo fails closed rather than
  letting traffic through unverified.
- **`IP_HASH_SALT`** — any random string. Not from the original spec's env
  list verbatim, but required to compute `sessions.ip_hash`.

One manual dashboard step `.env` can't cover: in Supabase, under
**Auth → Emails → Magic Link**, change the confirmation link to
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` so it
matches `app/auth/confirm/route.ts`.

```bash
npm run dev
```

- `/session/[id]` — without a `?stageId=` query param, a manual, unguarded
  connectivity test for the voice loop (`mode: 'full'`, no turn capture,
  gated behind sign-in as of Phase 2). Displays live TTFA/median/p90. With
  `?stageId=`, the real interview room: gated on ownership + the stage
  being unlocked, captures turns, scores on completion, and redirects to
  the scorecard.
- `/demo` — the real public flow: language toggle, Turnstile, mic
  permission, a 2-minute countdown.
- `/sign-in` → `/onboarding` — sign in with a magic link, then upload a CV
  and paste a job description to generate a roadmap (Phase 4's UI for
  starting a stage from that roadmap doesn't exist yet — see Known gaps).
- `/sample-scorecard` — the scorecard UI on a fixture, no auth needed.

## Known gaps and risks

- **`GEMINI_API_KEY` is on the free tier.** Confirmed via a real quota-exceeded
  error (`generate_content_free_tier_requests`, 20/day per model) — this is
  the exact check specs §2 flagged as something to verify *before Phase 0*,
  which never happened until Phase 2's testing surfaced it directly. Current
  mitigation is the onboarding page's data-usage notice, not paid billing —
  that was a deliberate choice, not an oversight, but it means real CV
  content may be used to improve Google's models, and the 20/day cap is a
  real operational limit (gap analysis alone uses 2 calls per attempt).
- **Nothing has run the full authenticated chain end-to-end yet.**
  `/api/analyze`'s two Gemini calls, and the scoring pipeline's one call,
  are each independently verified against the real API; the scorecard UI
  is verified rendering correctly via the static `/sample-scorecard` page.
  What's *not* yet verified is the whole chain in one run — sign in, upload
  a real CV, run a real interview, get scored — since that needs a real
  signed-in user (the magic link requires clicking through a real inbox)
  and the free-tier Gemini quota (20 requests/model/day) has been the
  limiting factor during development.
- **The Gemini structured-output complexity budget is undocumented.** The
  two-call split works for `GapAnalysis`; `Scorecard` stays one call
  because it's shallow enough not to hit the same budget. If either schema
  grows another nested field, re-check against the live API — this was
  found by bisection, not a published limit.
- **`mode: 'full'` without a `stageId` is still an intentionally unguarded
  smoke test.** With a `stageId`, the token endpoint now fully gates on
  auth + ownership + the stage being unlocked (specs §8.3). Without one, it
  stays the original Phase 0 connectivity check — no CV data, no
  stage-specific prompt, low enough risk to leave reachable by anyone who
  knows the endpoint.
- **No UI actually links to `/session/[id]?stageId=...` yet.** That trigger
  is Phase 4's "Start" button on the skill tree, which doesn't exist until
  Phase 4. The mechanism (session creation, gating, turn capture, scoring)
  is built and independently testable by constructing the URL by hand.
- **TTFA's local fallback is a heuristic, not ground truth.** It infers
  end-of-speech from mic energy dropping for ~800ms, mirroring the server's
  own `silenceDurationMs` — useful for a sanity check, not a rigorous
  benchmark, until the project is allowlisted for the real
  `voiceActivityDetectionSignal`.
- **`/sample-scorecard` uses a fixture, not a real scorecard.** The spec
  calls for "a real scorecard of mine" — swap
  `lib/fixtures/sample-scorecard.ts` for a real one once a real interview
  has actually been scored.
- **The demo reel and GitHub link on the landing page are placeholders.**
  The reel is recorded now that Phase 3's scorecards exist to show off, but
  hasn't been; the repo link needs to be filled in by hand.

## Roadmap

- [x] Phase 0 — voice loop walking skeleton
- [x] Phase 1 — public demo + guardrails
- [x] Phase 2 — CV/JD intake and gap analysis (built, not yet fully
      end-to-end verified — see Known gaps and risks)
- [x] Phase 3 — transcripts and scorecards (built, not yet fully
      end-to-end verified — see Known gaps and risks)
- [ ] Phase 4 — gamified roadmap
- [ ] Phase 5 — ship

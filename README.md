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

**Phase 2** (auth, CV/JD intake, gap analysis) is built and now verified
**end-to-end with a real signed-in user, a real CV, and real Gemini calls**
— sign in, upload, analyze, and the resulting roadmap/stages/progress rows
confirmed correct in Postgres. Getting there surfaced two real bugs, both
fixed: the magic-link confirm route only handled half of Supabase's actual
auth flow (see git history for the ugly detail), and `stages` had no RLS
INSERT policy at all — an out-of-the-box gap in the spec's own §3 SQL, not
something introduced later, and one that also silently affected
`scorecards` before anyone ever got that far.

**Phase 3** (turn capture, deterministic metrics, Gemini scoring, scorecard
UI) is built and **has now run start-to-finish against the live API**: two
real sessions connected, captured turns, scored, and wrote `scorecards` rows
with XP and stars. Both were *short* — the Live API's free-tier quota starves
the interviewer after a couple of turns — so the pipeline is proven while the
scores themselves aren't meaningful yet (see Known gaps).

**Phase 4** (gamified roadmap) is built: the serpentine skill tree with
locked/available/attempted nodes, an XP bar and streak counter, a stage
detail sheet, and the Start button that launches a real interview. XP and
streak now actually accumulate on `profiles` when a session is scored.

Phase 5 — shipping — is not built yet. See [Roadmap](#roadmap) below.

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
- **A gamified roadmap.** `/roadmap/[id]` draws the four stages as a
  serpentine skill tree — grey/locked with a lock icon, blue/pulsing when
  available, amber with stars once attempted — over a progress path that
  fills as stages unlock, plus an XP bar and streak counter. Tapping a node
  opens a sheet with the stage's focus areas, best score, attempts, and
  Start. Every bit of that state is read from Postgres per request, so it
  survives a hard refresh by construction.
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
  and timestamped relative to session start. A turn closes out on
  activity-end for the candidate and `turnComplete` for the interviewer —
  signals already proven reliable — not solely on the transcription API's
  own `finished` flag, which turned out not to reliably fire in practice
  (a real bug: a full interview produced zero captured turns before this
  was found). A response watchdog separately flags when the interviewer
  goes silent for 12s after the candidate stops talking — usually a Live
  API free-tier quota issue, confirmed by bisecting directly against the
  API, not a prompt problem. Flushed to Postgres on a 60s safety timer, on
  session end, and on tab close via `fetch(..., {keepalive: true})` — not
  `navigator.sendBeacon`, which is POST-only and can't carry the PATCH this
  needs.
- **Scoring.** One Gemini call — transcript, stage focus areas/question
  bank, roadmap gaps, and the deterministic metrics (commented on, never
  recomputed by the model) in; a Scorecard out. `Scorecard` is shallow
  enough (no array nested inside another array) that it doesn't hit the
  complexity budget `GapAnalysis` does, so this one stays a single call as
  specced. Every strength's quote is checked against the actual transcript
  and dropped if it isn't verbatim.
- **Progression state.** There is no client-side game state: the skill tree
  is a server component that reads `stages`, `progress`, and `profiles` on
  every request and hands the client plain data. Unlocking is decided by
  `/api/sessions/[id]/score` writing `progress`, never by the UI. The one
  piece of client state is which node's sheet is open.
- **Profile rows are created by a database trigger**, not by application
  code. `profiles` is where XP and streaks live, but nothing ever inserted
  into it — the spec's §3 schema defines the table and never creates a row
  for a new user, so XP had nowhere to go. Migration `006` adds a
  `SECURITY DEFINER` trigger on `auth.users` (and backfills existing users),
  which is the only place a row can be created at signup time without
  granting the client write access to it.

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
| XP per level | 500 | The spec has an XP formula but no level system; the bar needs *some* target, and this one is arbitrary and clearly marked as such in the code |
| Skill-tree layout | Fixed coordinates, not measured DOM | Four nodes at known spacing make the serpentine path deterministic — no refs, layout effects, or resize observer |
| Progress path fill | Plain `<path>` + CSS transition, not `motion.path` | Motion owns `strokeDasharray`/`strokeDashoffset` internally; animating them through it produced a path stuck at 3% of its target (verified in-browser) |

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
  and paste a job description to generate a roadmap.
- `/roadmap/[roadmapId]` — the skill tree: XP bar, streak, four stage nodes,
  and the Start button that creates a session and drops you into the
  interview room.
- `/sample-scorecard` — the scorecard UI on a fixture, no auth needed.

## Known gaps and risks

- **`GEMINI_API_KEY` is on the free tier — and it's confirmed constraining
  more than just CV analysis.** The text model's cap
  (`generate_content_free_tier_requests`, 20/day) was the first one hit;
  since then, the **Live API's own separate free-tier quota** was also
  exhausted mid-testing (`1011 — You exceeded your current quota`),
  meaning real spoken interviews can silently stop getting replies, not
  just gap analysis. This is the exact check specs §2 flagged as something
  to verify *before Phase 0*, which never happened. Current mitigation is
  the onboarding page's data-usage notice, not paid billing — a deliberate
  choice, kept even after this got confirmed to affect the core interview
  feature, not just an auxiliary pipeline.
- **A Live session can go silent with zero error signal.** When its quota
  is exhausted, the API doesn't reliably error — confirmed by bisecting
  directly against it: the exact same config that got a full audio reply
  seconds earlier later produced nothing at all (no audio, no text, no
  close event) before an explicit `1011` close eventually showed up on a
  later attempt. `/session/[id]` now runs a 12s watchdog after the
  candidate stops talking and surfaces a visible warning if no reply
  audio shows up — the interviewer prompt itself was never the problem
  (verified: it works fine with quota available), but the app previously
  gave zero feedback when it wasn't.
- **The whole chain is verified end-to-end, but the interviews are too
  short to be useful.** Sign in → upload a real CV → analyze →
  roadmap/stages/progress in Postgres → start a stage → talk → turns
  captured → scored → scorecard, all with real data, real auth, and real
  Gemini calls (this is also how a real RLS gap surfaced: `stages` and
  `scorecards` only ever had a SELECT policy in the spec's own §3 SQL,
  never INSERT). The two completed sessions captured **two turns each**
  and scored 5/100 — the Live API quota above stops the interviewer from
  asking anything further, so those numbers say nothing about the scoring
  model's quality. That needs a paid key, not a code change.
- **XP is not retroactive.** XP accumulation onto `profiles` and the
  trigger that creates those rows both landed in Phase 4, after the first
  scored sessions existed. Their XP was awarded on the scorecard but never
  added to a profile, so the XP bar starts at 0 for a user with history.
  Backfilling it from existing `scorecards` would be a few lines; it isn't
  worth doing for two throwaway test sessions.
- **A failed `/api/analyze` attempt leaves an orphaned `roadmaps` row.**
  Documents and the roadmap insert happen before stages; if anything after
  that fails, there's no cleanup. Harmless (nothing reads a roadmap with 0
  stages), just clutter — worth a transaction or explicit cleanup later,
  not urgent now.
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
- **specs §8.3's "considered, deferred" list is still deferred.** Streak
  freezes, leaderboards, achievement badges, daily goals, and push
  notifications are all named in the spec as explicitly out of scope, and
  none of them are built. The one place this leaks into behaviour: a missed
  day resets the streak to 1 with no grace period, because a streak freeze
  is exactly the deferred feature that would prevent it.
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
- [x] Phase 2 — CV/JD intake and gap analysis (verified end-to-end with a
      real user, real CV, real Gemini calls)
- [x] Phase 3 — transcripts and scorecards (run end-to-end against the live
      API; sessions cut short by the Live API quota — see Known gaps and risks)
- [x] Phase 4 — gamified roadmap (skill tree, XP, streaks, stage sheet, Start)
- [ ] Phase 5 — ship

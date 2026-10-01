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
UI) is built and **verified against the live API with a full-length
interview**: 6m43s, 30 captured turns, scored 28/100 with grounded strengths,
improvements and model answers. Two earlier sessions were cut to two turns
each by the Live API quota; the long one shows the pipeline works when the
quota holds.

**Phase 4** (gamified roadmap) is built: the serpentine skill tree with
locked/available/attempted nodes, an XP bar and streak counter, a stage
detail sheet, and the Start button that launches a real interview. XP and
streak now actually accumulate on `profiles` when a session is scored.

**Navigation** was then built on top of all of it. Not a numbered phase — the
spec never described one, which is exactly how the app ended up with seven
authenticated pages and no way to move between them. Every route was a leaf
reachable only by typing its URL: no shell, no back links, no list of past
interviews, no list of uploaded documents, and signing back in dropped you
into the wizard that builds a *new* roadmap rather than anywhere you'd been.

**Phase 5** (ship) is partly built. Done: automatic cleanup on failed
analyses, roadmap and document deletion with confirmation UI, interview
history status filtering with quick scoring recovery, a landing page with an
interactive voice & scorecard preview and repository link, the AI disclosure
before every session, the upload-page privacy notice, and full account
deletion. Still open from specs §9: the demo reel, error monitoring, an uptime
check, and the three real interview preps — see [Roadmap](#roadmap).

**Hardening** (unspecced, like Navigation). The repo had no tests at all; it
now has unit, route-handler, component and browser tests plus CI, all at
zero API quota — see [Testing](#testing). Alongside: interviews can be
deleted (one at a time, or every empty session at once), `/interviews` was
rebuilt around what actually happened in each session, times show in the
viewer's own time zone instead of UTC, there's a System / Light / Dark
switch, a sign-in page that explains failed links, and dark-mode text
contrast now meets WCAG AA.

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
  timestamps, and scores it into a scorecard on completion — pass mark and
  what it unlocks, attempt history, per-question scores with "drill this"
  links, STAR
  breakdown, deterministic communication metrics, grounded strengths and
  improvements, model answers, and XP/stage-unlock progression.
- **Virtual Video Interview Room (Mirror Practice + 3D Avatar).** `/session/[id]`
  features a Google Meet / Zoom style video interface: an audio-reactive 3D
  procedural avatar with natural blinking, breathing, and persona rim lighting
  for the interviewer, alongside a real-time self-camera mirror feed for posture,
  framing, and eye contact practice. Microphone capture is strictly decoupled
  from camera video so denying camera access never halts the voice interview.
- **Targeted Question Drill Mode.** Practice individual high-stakes questions
  and uncomfortable CV gaps in rapid 2-minute audio drill sessions. Launchable
  directly from stage question banks or the Recommended Drills card on the
  roadmap. Features dedicated drill arcs (`DRILL_ARC`) with 1 targeted follow-up
  probe, a dedicated in-room question HUD, focused STAR evaluation, and tailored
  model answers grounded in your CV. Drills earn XP but never touch stage
  progress — see Architecture.
- **A gamified roadmap.** `/roadmap/[id]` draws the four stages as a
  serpentine skill tree — grey/locked with a lock icon, blue/pulsing when
  available, amber with stars once attempted — over a progress path that
  fills as stages unlock, plus an XP bar and streak counter. Tapping a node
  opens a sheet with the stage's focus areas, best score, attempts, and
  Start. Every bit of that state is read from Postgres per request, so it
  survives a hard refresh by construction.
- **An app you can actually navigate.** A persistent shell with Home /
  Interviews / Documents, an explicit back link on every leaf page, a hub
  listing your roadmaps and recent interviews, a full interview history with
  scores, and a document list with signed links to the CVs you uploaded.
- **Your data, deletable.** The upload page says what happens to a CV, how
  long it's kept and how to delete it; roadmaps (with their interviews and
  documents) can be deleted from Home or the roadmap page, single interviews
  from `/interviews`, and `/documents` deletes the whole account.
- **An interview history that tells you something.** `/interviews` leads
  with your latest score, the change since the previous interview, a trend
  line, your best score and time practised; then every session grouped by
  day, filterable by state and roadmap, each labelled by what happened
  (scored, needs scoring, in progress, not started) rather than by a status
  column that said "Active" for weeks.
- **Light and dark.** System / Light / Dark from the header, remembered per
  browser and rendered by the server, so there's no flash of the wrong
  theme.
- **AI disclosure.** Both the demo and the interview room say "You'll be
  speaking with an AI interviewer, not a person" before a session starts, the
  interviewer tile carries a permanent AI label, and the prompt forbids the
  persona from claiming to be human (specs §9, EU AI Act Art. 50).
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
- **Microphone before spend.** `getUserMedia` runs before the ephemeral token
  is minted or the Live socket is opened, and the granted `MediaStream` is
  handed to the recorder rather than requested a second time. It used to be
  the last step, so a blocked mic paid for a Live API session — the scarcest
  resource in this app on the free tier — and then failed with a bare
  `NotAllowedError` in the console and nothing in the UI. Verified by stubbing
  `getUserMedia` to reject: no `/api/live/token` request is made at all.
- **Scoring is recoverable.** Turns are flushed to Postgres before the
  scoring call runs, so a failed score never costs the interview — but until
  recently nothing could ask for one again, and a transient Gemini 503 left an
  11-minute session permanently unscored with only a console message. Scoring
  is now idempotent — a second POST returns the existing scorecard rather than
  tripping `scorecards.session_id`'s unique constraint, and because that check
  is a read, two concurrent requests can both pass it, so a losing insert
  re-reads and returns the winner's scorecard instead of reporting a 502 for a
  session that is in fact scored. Any session with
  captured turns and no scorecard offers to run it — from the interview room
  where it failed, and from `/interviews` afterwards. Abandoned sessions
  qualify too: closing the tab still flushes the turns.
- **Interview arc.** The interviewer prompt carries an explicit running
  order — greet, introduce yourself, invite the candidate to walk through
  their own background, follow up on what they actually said, and only then
  work into the stage's questions, with the uncomfortable ones held for the
  second half. Without it the model treats the question bank as a to-do list
  and opens with the sharpest item in it: a real recruiter screen began with
  "explain the overlap between your CDI and your freelance work", which is an
  interrogation rather than an interview. The same block tells it to call out
  a non-answer and re-ask instead of accepting it — that same session replied
  "D'accord, je vois" to a candidate who had only said "Bonjour".
- **Turn capture.** Timing comes from audio, words from transcription —
  `lib/live/turn-timeline.ts`. Turns used to be stamped with the arrival
  time of their first transcription delta, but the Live API delivers the
  candidate's transcription late, right as the interviewer starts replying:
  a real 7-minute session had every candidate turn starting within 1ms of
  the interviewer turn beside it, so pauses came out negative ("longest
  pause 0.0s") and a 112-word answer was timed at 4.6s. The candidate is now
  timed by the local energy VAD, the interviewer by when its audio is
  scheduled to start and finish playing (cut short on barge-in), and an
  answer is committed once the reply to it ends — by which point its late
  transcription has arrived. Scorecards recorded before the fix are
  detected by their overlapping turns and hide the timing metrics rather
  than show wrong ones. (Before that, turns closed on the transcription
  API's own `finished` flag, which doesn't reliably fire — a full interview
  once produced zero captured turns.) A response watchdog separately flags when the interviewer
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
- **Drills don't move the skill tree.** A drill is one question and one
  follow-up, scored against that question alone, so it awards XP and updates
  the streak but never writes `progress`. It used to go through the same path
  as a full interview, which meant one good 2-minute answer could set a
  stage's best score and stars and unlock the next stage outright.
- **Account deletion.** `DELETE /api/account` empties the user's folder in
  the `cvs` bucket first (listing the folder, not trusting
  `documents.storage_path`, so leftovers from a failed analysis go too), then
  deletes the auth user with the service-role client; every user-owned table
  cascades from `auth.users`. Storage goes first because it has no cascade: if
  that step fails, the account is left intact to retry rather than deleted
  with its CVs still in the bucket.
- **Navigation.** `/home` is the hub and the post-sign-in landing page; it
  redirects to `/onboarding` only when you have no roadmaps at all, so the
  wizard is the first-run screen rather than the front door. Back links name
  their destination (`← Agent Builder at Hymaïa`) instead of calling
  `router.back()`, because a scorecard is reached both from the history list
  and from a redirect out of the interview room, where going "back" would
  land on a dead session. The interview room only offers an exit while idle:
  mid-session, Stop is the correct way out because it flushes turns and
  scores, and a client-side `<Link>` would skip that entirely.
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
| Back navigation | Explicit `href` per page, never `router.back()` | The scorecard is reachable from two directions, one of which is a redirect off a closed session |
| List page joins | Separate queries merged in JS, not PostgREST embedding | `scorecards.session_id` is unique, so an embed's result shape depends on relationship detection; these tables are tiny |
| Interview arc | Enforced in the interviewer prompt, and the bank is ordered at generation time | The prompt fix reaches roadmaps that already exist; the generation fix only reaches new ones |
| Scoring retries | 3 attempts per model, then the fallback model, plus a manual retry in the UI | Each automatic retry spends one of the model's daily free-tier requests; a deliberate retry is cheaper than a speculative one |
| Scorecard charts | Labelled 0–100 bars, not a radar | Four unlabelled spokes hid the actual numbers; bars show them and made `recharts` unnecessary |
| Avatar | Procedural Three.js bust, mouth driven by output loudness | No external model files or licences, light enough for phones; the look is seeded from the persona name, never inferred from it |
| Text-model fallback | `GEMINI_TEXT_FALLBACK_MODEL` on 503 (after a retry) or 429 (at once) | Free-tier quotas are per model and 503s count against them: two analyses that got 3 × 503 each left `gemini-3.6-flash` at 5/5 RPM and 12/20 RPD. A second model is a different capacity pool and a separate quota |
| Question-bank arc | Encoded as array order, not a `phase` field per question | `GapAnalysis` already sits at Gemini's undocumented structured-output complexity budget; another field risks re-triggering the 400 |
| Drill scoring | XP and streak only, no `progress` write | A single-question drill isn't evidence about a whole stage, and letting it unlock one bypassed the interview the tree gates |
| Account deletion | Delete the auth user and let FKs cascade, storage cleared first | One source of truth for "what belongs to a user"; storage is the only thing the cascade can't reach |
| Deleting an interview | Removes the transcript and scorecard; XP and stage progress stay | Recomputing them from what's left would let a deletion re-lock a stage mid-roadmap |
| "Is this session in progress?" | Active *and* under 30 minutes old with nothing recorded | The row is created when the room opens, so status alone left idle visits "Active" forever |
| Displayed times | UTC on the server, the viewer's zone after hydration (`<LocalTime>`) | The server can't know the zone; rendering local time there breaks hydration, rendering UTC everywhere showed 20:10 as 18:10 |
| Theme storage | Cookie, read by the root layout | The server renders `<html class="dark">` itself: no inline script, no flash, no hydration mismatch |
| Browser tests | Production build with placeholder credentials; Gemini routes fail the test | Tests must never spend quota or touch real data, by construction rather than by care |

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
- **`GEMINI_TEXT_FALLBACK_MODEL`** — optional. Used for gap analysis and
  scoring when `GEMINI_TEXT_MODEL` is overloaded or out of quota; a Flash Lite
  model has 25× the free-tier daily requests of a Flash one. Verify it
  accepts the `GapAnalysis` schema before relying on it (see the complexity
  budget in Known gaps).
- **`NEXT_PUBLIC_SUPABASE_URL`**, **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**,
  **`SUPABASE_SERVICE_ROLE_KEY`** — from your Supabase project's API
  settings. Apply the migrations in `supabase/migrations/` in order. The
  service-role key is used for the demo's guardrails and for account
  deletion only.
- **`TURNSTILE_SECRET_KEY`**, **`NEXT_PUBLIC_TURNSTILE_SITE_KEY`** — from the
  [Cloudflare Turnstile dashboard](https://dash.cloudflare.com). Required
  for the `/demo` guardrails; without them the demo fails closed rather than
  letting traffic through unverified.
- **`IP_HASH_SALT`** — any random string. Not from the original spec's env
  list verbatim, but required to compute `sessions.ip_hash`.

Magic links work with Supabase's default email template, with two catches
worth knowing: the link only works **in the browser that requested it**
(PKCE keeps a verifier cookie there), and only the most recent link works.
If the request errors in the browser — even when Supabase did send the email
— supabase-js deletes that verifier and the email's link can't be used.
`/sign-in` explains each of these when it happens.

To make links work in any browser or device, switch the Magic Link and
Confirm Signup templates to
`{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email` —
`app/auth/confirm/route.ts` already handles that shape. Supabase only lets
you edit templates once **custom SMTP** is configured (Authentication →
Emails), which also lifts the built-in sender's low hourly limit.

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
- `/sign-in` → `/home` — sign in with a magic link. First-time users are
  forwarded to `/onboarding` to upload a CV and paste a job description.
  A failed link comes back here with the reason (`?error=browser|expired|link`).
- `/home` — the hub: XP and streak, your roadmaps with per-stage progress,
  and your five most recent scored interviews.
- `/interviews` — a progress summary, then every session you've started,
  grouped by day and filterable by state and roadmap. Scored rows open their
  scorecard, unscored ones with answers can be scored, and any of them can be
  deleted — empty ones all at once.
- `/documents` — the CVs and job descriptions behind each roadmap. CVs get a
  one-hour signed URL; the `cvs` bucket is private. The "Your data" section
  at the bottom deletes the account.
- `/roadmap/[roadmapId]` — the skill tree: XP bar, streak, four stage nodes,
  and the Start button that creates a session and drops you into the
  interview room.
- `/sample-scorecard` — the scorecard UI on a fixture, no auth needed.

## Testing

```bash
npm run check      # typecheck + lint + unit/component tests (~15s)
npm run test:e2e   # browser tests against a fresh production build (~1.5 min)
```

None of it spends Gemini quota or touches the real Supabase project: unit
and route tests use fakes, and the browser tests build the app with
placeholder credentials and fail if a page so much as requests a token. CI
runs both on every push and pull request. What each layer covers, how to
write a route test, and what isn't covered: [docs/TESTING.md](docs/TESTING.md).

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
- **The whole chain is verified end-to-end.** Sign in → upload a real CV →
  analyze → roadmap/stages/progress in Postgres → start a stage → talk →
  turns captured → scored → scorecard, all with real data, real auth, and
  real Gemini calls (this is also how a real RLS gap surfaced: `stages` and
  `scorecards` only ever had a SELECT policy in the spec's own §3 SQL,
  never INSERT). The longest run so far is 6m43s and 30 turns. Two earlier
  sessions ended after two turns each and scored 5/100 — that's the Live
  API quota above, not the scoring model, and it's the failure mode to
  expect on a free key.
- **XP is not retroactive.** XP accumulation onto `profiles` and the
  trigger that creates those rows both landed in Phase 4, after the first
  scored sessions existed. Those sessions' XP (8 and 9) was written to their
  scorecards and never added to a profile, so the bar currently reads 49 —
  the one session scored since — rather than 66. Backfilling from existing
  `scorecards` would be a few lines; it isn't worth doing for two throwaway
  test sessions.
- **Failed analyses clean up after themselves, but not atomically.**
  `/api/analyze` now removes the stored CV, documents and roadmap row when a
  later step fails, as a sequence of best-effort deletes rather than a
  transaction. Leftovers from before that existed — and anything a cleanup
  step itself fails to remove — are still labelled "analysis didn't finish"
  on `/home`, `/roadmap/[id]` and `/documents`, and can be discarded from
  there.
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
- **`/sample-scorecard` still uses a fixture.** The spec calls for "a real
  scorecard of mine", and as of the 6m43s session there finally is one worth
  showing — `lib/fixtures/sample-scorecard.ts` just hasn't been swapped for
  it yet. Doing so means deciding how much of a real transcript to publish.
- **Nothing can be renamed or re-analyzed.** Roadmaps, unlinked documents and
  the whole account can be deleted from the UI, but there's no rename and no
  way to re-run the analysis against an updated CV short of deleting the
  roadmap and starting over.
- **Roadmaps built before the arc fix still have gap-first question banks.**
  The generation prompt now requires the first question to be a broad opener
  and the pointed ones to come last, but that only affects roadmaps analysed
  from now on. Existing banks — including one whose first two entries
  challenge a date overlap and a seniority gap — are unchanged in Postgres.
  The interviewer prompt tells the model to re-sort the bank and open on its
  own, which covers the symptom (verified: it now opens with a proper
  introduction against that exact bank), but the stored data is still wrong
  and a re-analysis is the real fix.
- **The interview history has no pagination.** It filters and groups now, but
  every session is still fetched and rendered at once. Fine at fifty
  sessions; not at five thousand.
- **Opening the interview room creates a session, even if you never start.**
  That's where the empty "not started" rows come from. `/interviews` labels
  them honestly and clears them in one click, but the real fix is to create
  the row when the call starts.
- **Signed-in pages have no browser tests.** Signing in needs the real
  Supabase project and a real inbox, so the signed-in UI is covered by
  component tests instead. A local Supabase with a seeded user would close
  this gap.
- **There is no demo reel.** The landing page has an interactive preview and
  a repository link, but the 45-second reel specs §5.1 and §9 put at the top
  of it hasn't been recorded.

## Roadmap

- [x] Phase 0 — voice loop walking skeleton
- [x] Phase 1 — public demo + guardrails
- [x] Phase 2 — CV/JD intake and gap analysis (verified end-to-end with a
      real user, real CV, real Gemini calls)
- [x] Phase 3 — transcripts and scorecards (run end-to-end against the live
      API; sessions cut short by the Live API quota — see Known gaps and risks)
- [x] Phase 4 — gamified roadmap (skill tree, XP, streaks, stage sheet, Start)
- [x] Navigation — app shell, hub, interview history, document list, back links
      (unspecced; the app was seven leaf pages with no way between them)
- [ ] Phase 5 — ship (specs §9)
  - [x] Failed-analysis cleanup, roadmap/document deletion, interview filtering, landing showcase
  - [x] AI disclosure before every session (EU AI Act Art. 50)
  - [x] Privacy notice on the upload page, and `DELETE /api/account`
  - [ ] 45-second demo reel on the landing page
  - [ ] Real scorecard on `/sample-scorecard` instead of the fixture
  - [ ] Error monitoring with the Live session error path covered
  - [ ] Uptime check on `/api/demo/status`
  - [ ] Use it for three real interview preps and write up the outcome
- [x] Hardening — unit, route, component and browser tests with CI;
      interview deletion; `/interviews` rebuilt; local times; light/dark
      switch; WCAG AA contrast (unspecced)
- [x] Phase 6 — targeted question drill mode (2-min audio drills on individual questions & CV gaps, drill HUD, dedicated DRILL_ARC, and instant STAR scoring)

# Testing

Three layers, all of which run without spending a single Gemini request or
touching the real Supabase project. That is a hard requirement, not a
preference: the free tier allows 20 text requests per model per day, and a
Live session is scarcer still (see AGENTS.md §2).

| Command | What it runs | Time |
|---|---|---|
| `npm run check` | typecheck + lint + unit/component tests | ~15 s |
| `npm run test` | unit + component tests (Vitest) | ~5 s |
| `npm run test:watch` | the same, re-running on save | — |
| `npm run test:e2e` | browser tests (Playwright) against a fresh production build | ~1.5 min |

Run `npm run check` before every commit and `npm run test:e2e` before
pushing. CI (`.github/workflows/ci.yml`) runs both on every push to `main`
and every pull request, and needs no secrets.

First time only: `npx playwright install chromium`.

## 1. Unit tests — `lib/**/*.test.ts`

Pure logic, in Node. These are the modules where a wrong number silently
corrupts every scorecard, so they carry most of the weight:

- `lib/metrics/` — pace, filler words (including accented French ones),
  talk ratio, pauses, and the good/watch/fix bands.
- `lib/live/turn-timeline.ts` — the event orders the Live API actually
  produces (late candidate transcription, barge-in, echo during playback).
  If you touch turn capture, add the sequence that broke to this file first.
- `lib/gemini/retry.ts` — the fallback policy: 503 retries the same model,
  429 moves to the next at once, anything else throws.
- `lib/progression.ts` — XP, stars and streaks (the clock is a parameter).
- `lib/interviews.ts` — what `/interviews` calls each session, the summary
  numbers, and day grouping in the viewer's time zone.
- `lib/prompts/interviewer.ts` — invariants, not wording: the AI disclosure
  is in every prompt, a drill replaces the question bank with the drill arc.

## 2. Route handler tests — `app/api/**/*.test.ts`

Handlers run for real against `tests/helpers/fake-supabase.ts`, a stand-in
client that records every query as `{ table, action, filters, payload }`
and answers from a callback. Use it to assert what a handler *asked the
database to do* — e.g. that a delete was scoped to the caller's `user_id`:

```ts
let fake = fakeSupabase();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
const { DELETE } = await import("@/app/api/sessions/[id]/route");

fake = fakeSupabase({ respond: () => ({ data: [{ id }] }) });
await DELETE(new Request("http://x", { method: "DELETE" }), routeContext({ id }));
expect(fake.ops[0].filters).toContainEqual(["eq", "user_id", "user-1"]);
```

It does not model RLS. Policies are SQL in `supabase/migrations/`; review
them there.

Never import a route that calls Gemini without mocking the Gemini module.

## 3. Component tests — `components/**/*.test.tsx`

React Testing Library in jsdom (opt in per file with
`// @vitest-environment jsdom`). Query by role and accessible name, the way
a user or a screen reader finds things; mock `fetch` and `next/navigation`.
This is where signed-in UI is tested, since the browser tests can't sign in
(below).

## 4. Browser tests — `e2e/*.spec.ts`

Playwright, Chromium, against `next build && next start` on port 3100. The
server gets **placeholder credentials** (`playwright.config.ts`): an
unreachable Supabase URL, no Gemini key. It builds into `.next-e2e/`, so it
never overwrites a real build.

`e2e/fixtures.ts` adds two automatic guards to every test:

- any request to `/api/live/token`, `/api/analyze`, a `/score` route or
  Gemini **fails the test** — this is how "a blocked mic never mints a
  token" is checked;
- console errors are collected (`consoleErrors`) for tests that assert a
  page loads cleanly.

Browser-side Supabase calls are intercepted with `page.route`, so the
sign-in flow can be driven through success, rate limiting and network
failure without sending email.

What's covered: public pages, signed-out redirects, 401s from every
mutating API route, sign-in, the demo up to the microphone, the theme
switch, and axe WCAG 2.1 AA scans of every public page in both themes
(serious and critical violations fail the run).

### What isn't covered, and why

- **Signed-in pages in a real browser.** Signing in needs a real Supabase
  project and a real inbox. They are covered by component tests instead.
  If a local Supabase (`supabase start`) is ever added, a seeded test user
  would close this gap.
- **Anything that talks to Gemini.** Live sessions, gap analysis and scoring
  are verified by hand, deliberately and rarely. See AGENTS.md §2.

## Gotchas

- `Cannot find module '../../app/.../page.js'` from `.next/types/validator.ts`
  after deleting a page: stale generated types. Delete `.next/types` (Next
  regenerates it) and run again.
- Next's route announcer is a `role="alert"` element on every page, so look
  for alerts inside `page.getByRole("main")`.
- `react-hooks/purity` rejects `Date.now()` inside a component, server
  components included. Read the clock in the data-loading function and pass
  it down (see `app/(app)/interviews/page.tsx`).

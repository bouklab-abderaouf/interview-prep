# Capacity and cost

Production readiness phase 4. How much Gemini each part of the app spends,
what that costs, and how to turn your project's real limits into the caps
in `.env`.

**Status (2026-10-01):** costs below come from Google's public pricing page
(updated 2026-10-01) and the app's own call pattern. Token counts are
**estimates**; replace them with measured numbers (see *Measuring*). The
per-project quota isn't published anywhere except your AI Studio dashboard,
so the capacity section has blanks for you to fill.

## What each flow spends

| Flow | Gemini calls | Notes |
|---|---|---|
| Public demo | 1 Live session, ≤ 2 min (`DEMO_SESSION_MAX_SECONDS`) | Plus 1 ephemeral-token mint |
| Full interview | 1 Live session, ≤ 10 min, then 1 scoring call | Scoring retries up to 3× per model on 503 |
| Drill | 1 Live session, ~2–3 min, then 1 scoring call | |
| CV analysis | 2 text calls (analysis + follow-up questions) | The PDF goes inline; up to 2× per model on 503 |

The microphone streams for the whole session, so **input audio minutes ≈
session length**. Output audio is only while the interviewer talks: about
40% of a session, judging by the talk ratios in real scorecards.

## Prices (paid tier, from ai.google.dev/gemini-api/docs/pricing)

| Model (as configured) | Input | Output |
|---|---|---|
| Live: `gemini-3.1-flash-live-preview` | audio $0.005/min, text $0.75 / 1M tokens | audio $0.018/min, text $4.50 / 1M tokens |
| Text: `gemini-3.6-flash` | $0.75 / 1M tokens (**$1.50 from 2027-01-01**) | $3.75 / 1M tokens (**$7.50 from 2027-01-01**) |
| Fallback: `gemini-3.5-flash-lite` | $0.30 / 1M tokens | $2.50 / 1M tokens |

The free tier costs nothing, but **"content used to improve our products:
yes"**. Paid tier: no. Other people's CVs can't go through the free tier,
which is why GDPR (phase 5) depends on this.

## Estimated cost per flow

| Flow | Estimate (2026) | From 2027 | Working |
|---|---|---|---|
| Demo (2 min) | ~$0.03 | ~$0.03 | 2 min × $0.005 + 0.8 min × $0.018 + ~3k tokens of system prompt and transcription |
| Full interview (10 min) + scoring | ~$0.15 | ~$0.17 | 10 × $0.005 + 4 × $0.018 + text; scoring ~4k in / ~5k out (including thinking) |
| Drill (3 min) + scoring | ~$0.06 | ~$0.08 | 3 × $0.005 + 1.2 × $0.018 + scoring |
| CV analysis | ~$0.05 | ~$0.10 | ~6k tokens in (prompt, PDF at ~258 tokens/page, JD) and ~12k out (two JSON outputs, including thinking) |

### Per month

Assuming an active user does 1 analysis, 8 full interviews and 10 drills a
month (about $1.85 in 2026, $2.26 from 2027):

| Active users | 2026 | From 2027 |
|---|---|---|
| 10 | ~$19 | ~$23 |
| 100 | ~$185 | ~$226 |
| 1,000 | ~$1,850 | ~$2,260 |

The demo adds at most **cap × $0.03 × 30** a month: $18 at the current
default cap of 20 a day, $180 at the old 200.

## Capacity: fill in your project's limits

From [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit)
(per project, per model):

| Limit | Free tier | Paid (Tier 1) |
|---|---|---|
| Live (`gemini-3.1-flash-live-preview`): concurrent sessions | ? | ? |
| Live: sessions (or requests) per day | ? | ? |
| `gemini-3.6-flash`: requests per minute / per day | 5 / 20 (seen in practice) | ? |
| `gemini-3.5-flash-lite`: requests per minute / per day | 15 / 500 (seen in practice) | ? |

Then:

- **Concurrent interviews** = Live concurrent sessions. A visitor past it
  gets "the interviewer is busy" (`lib/live/close-reason.ts`) and a
  `live.closed_abnormally` event tagged `kind=busy`.
- **Daily Live sessions** = demo sessions + signed-in interviews and drills.
  Set `DEMO_MAX_SESSIONS_PER_DAY` to at most **(Live sessions per day) −
  (signed-in sessions you expect)**, with headroom. The default is a
  deliberately low 20 until this is filled in.
- **Text requests per day** = (primary RPD + fallback RPD), shared by
  analyses (2 requests each, more on retries) and scorings (1 each). So a
  day holds at most about **(RPD total − scorings) ÷ 2** analyses.
- **Per-user limits** (`USER_MAX_*`) stop one account from taking the whole
  pool. A rule of thumb: an account's daily interviews × 1 Live session must
  stay a small fraction of the project's daily Live sessions.

## Measuring instead of estimating

After a few real sessions: AI Studio → Usage → pick the model → tokens and
cost per day. Divide by that day's sessions, from `/interviews` or
`select mode, count(*) from sessions where started_at::date = '…' group by
mode`. Put the measured numbers in the tables above and recompute the caps.

## Budget

On a paid tier, set a budget alert in Google Cloud Billing (for example 50%,
90% and 100% of a monthly amount) on the project that owns the API key.
Google stops nothing at the budget; the alert is a warning. The hard stops
are the app's own caps — the demo kill switch and the per-user limits
(docs/RUNBOOK.md).

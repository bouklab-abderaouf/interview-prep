# Data inventory

Every piece of personal data the app handles: where it lives, who
processes it, why, on what basis, for how long, and how it's deleted.
Production readiness phase 5. The public-facing version is `/privacy`
(`app/(marketing)/privacy/page.tsx`); both draw on `lib/legal.ts`. **Change
this file whenever data is added, moved or kept longer**, and update the
privacy page with it.

*Engineering inventory, not legal advice. Have it reviewed with the privacy
policy before opening sign-ups.*

| Data | Stored where | Processed by | Purpose | Legal basis (GDPR art. 6) | Retention | Deleted by |
|---|---|---|---|---|---|---|
| Account email | Supabase Auth (EU, eu-west-1) | Supabase; the email sender (Supabase built-in now, custom SMTP later) | Sign-in links | Contract (b) | Life of the account | Account deletion (`DELETE /api/account`) |
| CV (PDF) | Supabase Storage, private `cvs` bucket, `{user}/{doc}.pdf` | Supabase; **Google Gemini (US)** during analysis | Build the interview plan | **Consent (a)**, recorded on `profiles` | Until the user deletes it | Roadmap / document / account deletion; orphans swept daily (`/api/cron/retention`) |
| Job description (text) | `documents.raw_text` | Supabase; Google Gemini during analysis | Build the interview plan | Consent (a) | Until deleted | Same as above |
| Gap analysis, roadmap, stages, questions | `roadmaps`, `stages` | Supabase; derived by Gemini | The interview plan | Contract (b) | Until deleted | Roadmap / account deletion (cascade) |
| Interview audio | **Not stored.** Streamed browser → Google Gemini Live | Google Gemini (US) | The live interview | Consent (a) | Google's terms; on the **free tier Google may use it to improve its products** | n/a |
| Interview transcript (turns) | `turns` | Supabase; Google Gemini during scoring | Scorecard, history | Contract (b); consent (a) for the Gemini step | Until deleted | Interview / roadmap / account deletion (cascade) |
| Scorecards, progress, XP, streak | `scorecards`, `progress`, `profiles` | Supabase | Feedback, progression | Contract (b) | Until deleted | Account deletion (cascade); deleting an interview removes its scorecard but keeps XP |
| AI-processing consent (date, version) | `profiles.ai_processing_consent_*` | Supabase | Proof of consent (accountability, art. 7(1)) | Legal obligation (c) | Life of the account | Account deletion |
| Daily usage counters | `user_daily_usage` | Supabase | Per-user daily limits | Legitimate interest (f): cost and abuse | 30 days | Retention job; account deletion (cascade) |
| Demo IP hash | `sessions.ip_hash` where `user_id is null` | Supabase | Per-IP demo rate limit | Legitimate interest (f) | 30 days | Retention job (`run_retention()`) |
| Demo audio | Not stored; streamed to Gemini | Google Gemini | The demo | Legitimate interest (f) / the visitor's request | Google's terms | n/a |
| Bot-check signals | Not stored by the app | Cloudflare Turnstile | Abuse prevention on the demo (and sign-in if enabled) | Legitimate interest (f) | Cloudflare's terms | n/a |
| Request logs (IP, paths) | Hosting provider | Vercel | Operations, security | Legitimate interest (f) | Provider's log retention | Provider |
| Error reports | Sentry (EU), when enabled | Sentry | Fixing failures | Legitimate interest (f) | Sentry project retention (set it to 30–90 days) | Sentry |
| Theme preference | `theme` cookie | Browser only | Remember light or dark | Not personal data in practice; functional | 1 year | User (or choosing System) |
| Sign-in session | `sb-*` cookies | Browser, Supabase | Stay signed in | Strictly necessary | Session refresh | Sign-out, account deletion |

## Rules that keep this true

- **Deletion:** every user-owned table cascades from `auth.users`
  (`tests/migrations.test.ts` fails otherwise). Storage has no cascade, so
  `DELETE /api/account` empties the user's folder first.
- **Export:** `GET /api/account/export` returns every row above that belongs
  to the user, plus signed CV links. A new user-owned table must be added
  there and to its test.
- **Consent:** `/api/analyze` refuses without the current `CONSENT_VERSION`
  (`lib/legal.ts`). Changing what is sent to Google, or to whom, means
  changing the wording and bumping the version.
- **Monitoring:** error reports are scrubbed to an allow-list
  (`lib/monitoring/scrub.ts`). No emails, transcripts, CV text, bodies or
  query strings.
- **Free tier:** `NEXT_PUBLIC_GEMINI_TIER` drives every notice about
  Google's use of the data. Set it to `paid` only once billing is really
  enabled.

## Processors and agreements (for you to complete)

| Processor | DPA | Transfer mechanism | Done |
|---|---|---|---|
| Supabase | Accept the DPA in the dashboard (Organization → Legal) | EU region; SCCs in the DPA | ☐ |
| Google (Gemini API, **paid tier**) | Google Cloud data processing terms apply once billing is enabled | EU–US DPF / SCCs | ☐ |
| Vercel | DPA in account settings | EU–US DPF / SCCs | ☐ |
| Cloudflare | DPA (self-serve) | EU–US DPF / SCCs | ☐ |
| Sentry | DPA (self-serve), EU data region | EU | ☐ |

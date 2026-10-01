# Launch checklist

Production readiness phase 7, step by step. Everything here needs your
accounts, so it's yours to do. The code side is ready. Go top to bottom; each
stage can be rolled back (docs/RUNBOOK.md, *Rollback*).

## 0. Before anything is public

From phases 1–6 (details in [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)):

- [ ] One live interview on the new security policy (phase 1).
- [ ] The voice red-team script (phase 2, [voice-redteam.md](voice-redteam.md)).
- [ ] Sentry project and DSN, its alerts, and uptime checks (phase 3, [RUNBOOK.md](RUNBOOK.md)).
- [ ] AI Studio quota numbers into [CAPACITY.md](CAPACITY.md), the caps recomputed, and free or paid decided (phase 4).
- [ ] Publisher details (`NEXT_PUBLIC_LEGAL_*`), DPAs, and a legal review (phase 5, [DATA.md](DATA.md)).
- [ ] The first CI run of the signed-in suite is green, the device checklist is done, and you've checked the session fix live (phase 6).

## 1. Hosting (Vercel)

1. Import the GitHub repository into Vercel (framework: Next.js; defaults are fine).
2. Settings → Environment Variables (Production), from `.env.local.example`:
   - Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Gemini: `GEMINI_API_KEY`, `GEMINI_LIVE_MODEL`, `GEMINI_TEXT_MODEL`, `GEMINI_TEXT_FALLBACK_MODEL`, `NEXT_PUBLIC_GEMINI_TIER`
   - Turnstile: `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   - Caps: `DEMO_MAX_SESSIONS_PER_DAY`, `DEMO_MAX_SESSIONS_PER_IP_PER_HOUR`, `USER_MAX_*` (from CAPACITY.md)
   - `IP_HASH_SALT` (a new random string), `CRON_SECRET` (a new random string)
   - Sentry: `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`
   - Legal: `NEXT_PUBLIC_LEGAL_*`
   - **Never** set `GEMINI_FAKE`, `ENABLE_VOICE_SMOKE_TEST` or `CSP_REPORT_ONLY` in production.
3. Add your domain, then redeploy so the `NEXT_PUBLIC_*` values are built in.
4. Check: Settings → Cron Jobs lists `/api/cron/retention` daily.

## 2. Email (custom SMTP)

Supabase's built-in sender is slow and allows only a few emails an hour.

1. Pick a provider (Resend, Brevo, Postmark…) and verify your domain there (SPF, DKIM).
2. Supabase → Authentication → Emails → SMTP settings: host, port, user, password, sender address.
3. Now the templates can be edited. In **Magic Link** and **Confirm signup**, set the link to:
   `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`
   so links work in any browser or device (`app/auth/confirm/route.ts` handles it).
4. Raise the email rate limit (Authentication → Rate Limits) to something sensible for your traffic.

## 3. Supabase settings

- Authentication → URL Configuration: **Site URL** = `https://<your domain>`; **Redirect URLs**: add `https://<your domain>/auth/confirm` (and the Vercel preview pattern if you use previews).
- Optional: Authentication → Bot protection → Turnstile with your keys, together with `NEXT_PUBLIC_SIGNIN_CAPTCHA=1` (RUNBOOK.md).
- Run the security advisors once more (RUNBOOK.md lists the accepted warnings).

## 4. Stage A — private

```sql
update app_settings set value = 'allowlist' where key = 'signups';
insert into signup_allowlist (email, note) values (lower('you@example.com'), 'owner');
```

Invite 3–5 testers (the phase 6 beta). Watch Sentry and the uptime checks
for a week. Fix what they find.

## 5. Stage B — public demo, sign-ups closed

```sql
update app_settings set value = 'closed' where key = 'signups';
```

Share the landing page. Watch `guardrail.*` and `live.*` events and the
demo's daily cap for a week; raise or lower caps from what you see.

## 6. Stage C — open sign-ups

Only once phase 5 is complete (paid tier, DPAs, legal review):

```sql
update app_settings set value = 'open' where key = 'signups';
```

## 7. Leftovers from specs §9

- [ ] Replace `lib/fixtures/sample-scorecard.ts` with one of your real scorecards (decide what of the transcript to publish).
- [ ] Record the 45-second demo reel for the landing page.
- [ ] Write up the three real preps (the Hymaïa and Celad roadmaps count).

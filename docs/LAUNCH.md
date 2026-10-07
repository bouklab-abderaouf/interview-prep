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

Free (Hobby) plan is enough to test with friends; it's for non-commercial use.
`vercel.json` already runs functions in Dublin (`dub1`), next to the Supabase
database (`eu-west-1`), and schedules the daily retention job.

1. Merge the work into `main` (Vercel deploys `main` to production).
2. vercel.com → Add New → Project → import the GitHub repository (framework: Next.js; defaults are fine).
3. Before the first deploy, Environment Variables: paste the whole of `.env.vercel` into the first
   *Key* field (Vercel splits it into variables), then delete that file. It's your `.env.local`
   plus what production needs; regenerate it with Claude if you've lost it. The full list, from
   `.env.local.example`:
   - Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Gemini: `GEMINI_API_KEY`, `GEMINI_LIVE_MODEL`, `GEMINI_TEXT_MODEL`, `GEMINI_TEXT_FALLBACK_MODEL`, `NEXT_PUBLIC_GEMINI_TIER`
   - Turnstile: `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   - Caps: `DEMO_MAX_SESSIONS_PER_DAY`, `DEMO_MAX_SESSIONS_PER_IP_PER_HOUR`, `USER_MAX_*` (from CAPACITY.md)
   - `IP_HASH_SALT` (a new random string), `CRON_SECRET` (a new random string)
   - Sentry: `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`
   - Legal: `NEXT_PUBLIC_LEGAL_*`
   - **Never** set `GEMINI_FAKE`, `ENABLE_VOICE_SMOKE_TEST` or `CSP_REPORT_ONLY` in production.
4. Deploy. Your address is `https://<project>.vercel.app` (Settings → Domains). Share that one:
   preview deployments (one per branch) ask for a Vercel login by default.
5. Changed a `NEXT_PUBLIC_*` variable later? Redeploy: they're built into the page.
6. Check: Settings → Cron Jobs lists `/api/cron/retention` daily.

## 2. Email (custom SMTP)

**Required before anyone but you can sign in.** Supabase's built-in sender
only delivers to members of your Supabase team, two emails an hour.

1. Pick a sender:
   - *To test with a few friends:* your Gmail. Turn on 2-step verification, then
     myaccount.google.com/apppasswords → create an app password. Host `smtp.gmail.com`,
     port `465`, user = your Gmail address, password = the 16-character app password,
     sender = your Gmail address. Gmail allows about 500 emails a day.
   - *For launch:* a provider (Resend, Brevo, Postmark…) with your own domain verified
     (SPF, DKIM), so links don't land in spam.
2. Supabase → Authentication → Emails → SMTP settings: host, port, user, password, sender address.
3. Now the templates can be edited. Paste `supabase/templates/magic-link.html` into **Magic Link**
   (subject: *Your Interview Prep sign-in link*) and `supabase/templates/confirm-signup.html` into
   **Confirm signup** (subject: *Confirm your email for Interview Prep*). Their link,
   `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`, works in any browser or device
   (`app/auth/confirm/route.ts` handles it). It needs `https://<your address>/auth/confirm` in the
   Redirect URLs (§3): otherwise `RedirectTo` falls back to the Site URL and the link breaks.
   The emails say links expire in 1 hour, Supabase's default (Email OTP Expiration); change one, change both.
4. Raise the email rate limit (Authentication → Rate Limits) to something sensible for your traffic.

## 3. Supabase settings

- Authentication → URL Configuration: **Site URL** = `https://<your address>`; **Redirect URLs**: add `https://<your address>/auth/confirm`, and keep `http://localhost:3000/auth/confirm` for `npm run dev`. Without it, sign-in emails point at the Site URL instead and the link fails.
- Cloudflare → Turnstile → your widget → Hostnames: add `<your address>`, or the public `/demo` fails its check.
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

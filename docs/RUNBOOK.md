# Runbook

What to do when something goes wrong, and how the operational switches work.
Production readiness phases 3, 5 and 7 add to this file.

## Switches

| Lever | Effect | How |
|---|---|---|
| Demo kill switch | `/demo` refuses new sessions ("demo paused") | Set `KILL_SWITCH_OVERRIDE=true` and redeploy, or for today only: `update usage_counters set killed = true where day = current_date;` (Supabase SQL editor, UTC day) |
| Demo caps | Daily total and per-IP-per-hour | `DEMO_MAX_SESSIONS_PER_DAY`, `DEMO_MAX_SESSIONS_PER_IP_PER_HOUR` |
| Signed-in spending | Per user, per UTC day | `USER_MAX_ANALYSES_PER_DAY`, `USER_MAX_SCORINGS_PER_DAY`, `USER_MAX_INTERVIEWS_PER_DAY`, `USER_MAX_DRILLS_PER_DAY`, `USER_MAX_SESSIONS_PER_DAY`. Set to `0` to stop that kind of spend for everyone. **The kill switch doesn't cover signed-in users — this does.** |
| CSP | Enforced by default | `CSP_REPORT_ONLY=1` turns it to report-only (the page works; the console names what *would* have been blocked). Use it to diagnose, then fix `lib/security/csp.ts` and turn it back off. |
| Voice smoke test | Stage-less Live session at `/session/<anything>` | Off in production unless `ENABLE_VOICE_SMOKE_TEST=1` (signed-in only, counts as an interview) |
| Sign-in bot check | Turnstile on the sign-in form | `NEXT_PUBLIC_SIGNIN_CAPTCHA=1` **and** Supabase → Authentication → Bot protection → Turnstile (same keys). Turn both on, or neither: either one alone breaks sign-in. |

Env changes need a redeploy (and `NEXT_PUBLIC_*` ones a rebuild).

## Rotating the Gemini API key

Do this if the key may have leaked (it should only ever be in the hosting
env and `.env.local`), or on a schedule.

1. Google AI Studio → API keys → create a new key in the same project.
2. Update `GEMINI_API_KEY` in the hosting environment, then redeploy.
3. Check that one analysis and one interview work, then delete the old key in AI Studio.

Live tokens already minted keep working until they expire (10 minutes at
most).

## Reading the logs

- **Auth** (sign-in failures, rate limits): Supabase → Logs → Auth. A failed
  magic link shows as `/verify` (303 = Supabase accepted it), followed by our
  `/auth/confirm`. The dev or hosting log prints the real reason as
  `[auth/confirm] sign-in link failed: <code>`.
- **API routes**: the hosting provider's function logs. Every route logs with
  a `[api/...]` prefix.
- **Errors and abuse signals**: Sentry (below).

## Error tracking (Sentry)

Setup (you):
1. Create a Sentry account, choosing the **EU (Frankfurt) data region**, and a
   **Next.js** project.
2. Set `NEXT_PUBLIC_SENTRY_DSN` (and optionally `SENTRY_DSN` for the server;
   it falls back to the public one) and `NEXT_PUBLIC_SENTRY_ENVIRONMENT`
   (`production`, `preview`). Rebuild: the CSP picks up the DSN's ingest host
   automatically.
3. In the project's *Security & Privacy* settings: enable the default data
   scrubbers and turn on *Prevent storing of IP addresses*. The app already
   scrubs before sending (`lib/monitoring/scrub.ts`); this is a second layer.

Nothing is sent without a DSN, and Sentry isn't even initialised.

What's sent: uncaught server and browser errors (via
`instrumentation.ts` / `instrumentation-client.ts` / `app/global-error.tsx`)
and the named events below. Never sent: users, emails, request bodies,
cookies, headers, query strings, console output (it contains transcripts),
CV text. No performance tracing, no session replay.

### Events and the alerts to create

| Event | Means | Suggested alert |
|---|---|---|
| `limits.unavailable` | The daily-limit check itself is failing — every quota route is refusing (fail closed) | Any occurrence, immediately |
| `live.closed_abnormally` (tag `code`) | Live socket closed badly. `code=1011` = Gemini Live quota exhausted | More than 5 in an hour |
| `live.watchdog_silence` | No reply 12s after the candidate stopped — usually quota, sometimes an outage | More than 5 in an hour |
| `token.mint_failed` | Gemini refused to mint a Live token | More than 3 in an hour |
| `session.scoring_failed` / `analysis.failed` (tag `status`) | 503 = Gemini overloaded, 429 = quota, other = a real bug | More than 3 in an hour; any non-503/429 immediately |
| `session.flush_failed` | Turns couldn't be saved — an interview may be lost | Any occurrence |
| `guardrail.kill_switch_tripped` | The demo hit its daily cap and turned itself off | Any occurrence (it's once a day at most) |
| `limits.daily_limit_hit` (tag `kind`) | A user hit a daily limit | More than 20 in an hour = someone is hammering the API |
| `guardrail.ip_rate_limited`, `guardrail.turnstile_failed` | Demo abuse signals | A spike (e.g. more than 30 in an hour) |
| `cron.retention_failed` | The daily GDPR retention job didn't finish (see *Data retention job*) | Any occurrence |
| `live.token_refused`, `live.mic_error` | Context for user reports | No alert |

Create these as Sentry *issue alerts* filtered on the `event` tag, sending
to email or phone.

## Uptime checks

Setup (you), with UptimeRobot or Better Stack (free tiers are enough):
- `GET /` → expect HTTP 200.
- `GET /api/demo/status` → expect HTTP 200 and the keyword `available`.
  (`"available":false` is not downtime — the demo is paused or capped — but
  `"reason":"status_check_failed"` means the database check is failing.)
- Every 5 minutes, alerting to email or phone after 2 failures.

## Supabase security advisors

Run them after every migration: Supabase → Advisors → Security (or the
Supabase MCP `get_advisors`). Expected and accepted (2026-10-01):
- `rls_enabled_no_policy` on `usage_counters`: by design. It's touched only
  by the service role.
- `authenticated_security_definer_function_executable` on
  `consume_user_quota`: by design. Users must call it through their own
  client so the database knows who they are, and `user_daily_usage` has no
  write policies. Making it `SECURITY INVOKER` would need write policies
  that let a user reset their own counter. Calling it directly can only
  spend the caller's own allowance.
- `auth_leaked_password_protection`: not applicable, sign-in is passwordless.

Anything else is new and needs a look.

## Data retention job

`/api/cron/retention` runs daily at 03:17 UTC through Vercel Cron
(`vercel.json`). It deletes demo IP hashes and daily-usage counters older
than 30 days (`run_retention()`, migration 009) and CV files that have no
`documents` row and are more than a day old.

- Needs `CRON_SECRET` set in the hosting env; Vercel sends it as
  `Authorization: Bearer …`. Without it the route answers 503 and deletes
  nothing.
- Run it by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/retention`.
  The response gives counts, e.g. `{"ok":true,"demo_sessions":2,"usage_rows":5,"orphan_cvs":0}`.
- If it fails, a `cron.retention_failed` event goes to Sentry.

## Personal data breach

GDPR art. 33–34. A breach is any accidental or unlawful loss, change,
disclosure of or access to personal data: a leaked service-role key, a
policy bug that exposed another user's rows, a lost laptop with `.env.local`.

1. **Contain (first hour).** Rotate whatever leaked: the Supabase
   service-role and anon keys (Settings → API), `GEMINI_API_KEY` (above),
   `CRON_SECRET`, `IP_HASH_SALT` if the hashes matter. Flip the demo kill
   switch and set the `USER_MAX_*` limits to 0 if spending is involved.
   Redeploy.
2. **Assess (same day).** What data, whose, how many people, since when?
   Supabase logs (API, Auth, Storage) and the hosting logs. Write it down
   as you go: the record is mandatory even if you don't notify.
3. **Notify the CNIL within 72 hours** of becoming aware, unless the breach
   is unlikely to put anyone at risk
   ([notifications.cnil.fr](https://notifications.cnil.fr/notifications/index)).
   Late is better than never; say why it's late.
4. **Tell the people affected** without undue delay if the risk to them is
   high (e.g. CVs or transcripts exposed): what happened, what it means,
   what you've done, what they can do.
5. **Fix and record.** The root cause, the fix, and a test that would have
   caught it. Keep the incident record (art. 33(5)).

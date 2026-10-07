# Running in Docker, shared through Cloudflare

The app runs as one container (`Dockerfile`, Next's standalone server). A
Cloudflare Tunnel gives it a public HTTPS address without opening a port on
your machine. HTTPS matters: browsers only allow the microphone on HTTPS (or
`localhost`). The machine running Docker must stay on while people use it. For
an always-on deployment, use Vercel (LAUNCH.md).

Everything below uses your `.env.local`. It never enters the image: the build
reads only its `NEXT_PUBLIC_*` lines, through a BuildKit secret, and the
container gets the rest when it starts. Change a `NEXT_PUBLIC_*` value and you
must rebuild (`--build`).

## Three ways to run it

```bash
docker compose up -d --build                    # just you: http://localhost:3030
docker compose --profile quick up -d --build    # + a temporary public URL, no account needed
docker compose --profile named up -d --build    # + your own hostname on Cloudflare
```

`APP_PORT=4000 docker compose up -d` picks another local port. The container
listens on 3030 by default so it doesn't collide with `npm run dev` on 3000.

**Quick tunnel.** Prints a random `https://<words>.trycloudflare.com` address:

```bash
docker compose logs tunnel | grep trycloudflare.com
```

That URL changes every time the tunnel container starts (a restart, a reboot,
`docker compose down`). Cloudflare gives no uptime guarantee for these; they're
meant for testing.

**Named tunnel.** For a stable address you need a domain on Cloudflare:

1. Cloudflare dashboard → Zero Trust → Networks → Tunnels → Create a tunnel
   (type *Cloudflared*). Copy its token.
2. In the tunnel's *Public Hostname* tab, add e.g. `prep.yourdomain.com` →
   service `HTTP`, URL `app:3000`.
3. Put `TUNNEL_TOKEN=<token>` in a file named `.env` next to `compose.yaml`
   (compose reads `.env`; it's ignored by git).

## Before anyone else signs in

Each step is needed once per public address, so after every quick-tunnel URL
change too.

1. **Supabase → Authentication → URL Configuration → Redirect URLs:** add
   `https://<the address>/auth/confirm`. Without it, Supabase sends the sign-in
   link to the Site URL instead (probably `localhost`), and your tester can't
   sign in. Add the exact address. Never add a wildcard like
   `https://*.trycloudflare.com/**`: anyone can make a trycloudflare address,
   and with that wildcard a link Supabase emails to your user could be sent
   to theirs.
2. **Who can sign up:** while the address is public, let in only the people
   you invite (migration 010; existing users always sign in):

   ```sql
   update app_settings set value = 'allowlist' where key = 'signups';
   insert into signup_allowlist (email, note) values (lower('friend@example.com'), 'tester');
   ```

   `update app_settings set value = 'open' where key = 'signups';` reopens it.
3. **Turnstile (the public `/demo` only):** Cloudflare dashboard → Turnstile →
   your widget → Hostnames: add the address, or the demo's check fails. The
   signed-in app doesn't use it unless `NEXT_PUBLIC_SIGNIN_CAPTCHA=1`.

Your tester uses your Gemini quota. The per-user daily limits (`USER_MAX_*`)
apply to them as to you.

## Day to day

```bash
docker compose ps                     # is it up, is it healthy
docker compose logs -f app            # server logs
docker compose --profile quick down   # stop everything (the quick URL is gone after this)
```

After pulling new code: `docker compose --profile quick up -d --build`. The
quick-tunnel URL survives if only the app container is rebuilt.

## What's different from Vercel

- **Redirects are relative.** Behind a tunnel, a route handler's `request.url`
  is the address the server listens on (`https://0.0.0.0:3000/…`), not the
  public one. Route handlers redirect with `redirectToPath()`
  (`lib/redirect.ts`), never `new URL(…, request.url)`.
- **Client IP:** compose sets `CLIENT_IP_HEADER=cf-connecting-ip`, the header
  Cloudflare sets itself. The first `X-Forwarded-For` hop is whatever the
  client sent (`lib/guardrails/rate-limit.ts`).
- **No cron:** the daily retention job (`/api/cron/retention`) is a Vercel cron.
  In Docker it doesn't run; for a test that's fine. Call it by hand if needed:
  `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3030/api/cron/retention`.

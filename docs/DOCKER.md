# Running the production image locally

Deployment is Vercel ([LAUNCH.md](LAUNCH.md)). The Docker image is for
running the real production build on your machine: what `npm run dev` doesn't
show (the strict CSP, HSTS, standalone server behavior).

```bash
docker compose up -d --build     # http://localhost:3030
docker compose logs -f app       # server logs
docker compose down              # stop it
```

It listens on 3030 so it doesn't collide with `npm run dev` on 3000
(`APP_PORT=4000 docker compose up -d` picks another port). Signing in works
once `http://localhost:3030/auth/confirm` is in Supabase's Redirect URLs.

**Secrets.** Your `.env.local` never enters the image: the build reads only its
`NEXT_PUBLIC_*` lines, through a BuildKit secret, and the container gets the
rest when it starts. Change a `NEXT_PUBLIC_*` value and rebuild (`--build`).

**Differences from Vercel.**

- Route handlers see `request.url` as the server's own address
  (`http://0.0.0.0:3000/…`), not the one the browser used. Redirects are
  relative for that reason: use `redirectToPath()` (`lib/redirect.ts`), never
  `new URL(…, request.url)`.
- The daily retention job is a Vercel cron and doesn't run here. Call it by
  hand if needed: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3030/api/cron/retention`.

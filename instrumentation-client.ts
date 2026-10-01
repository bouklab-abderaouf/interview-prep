import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/monitoring/sentry-options";

// Browser error tracking (production readiness phase 3). Inert unless
// NEXT_PUBLIC_SENTRY_DSN is set at build time; every event passes through
// lib/monitoring/scrub.ts first, and the CSP allows the DSN's ingest host.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init(sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

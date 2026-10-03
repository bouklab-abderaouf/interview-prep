import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/monitoring/sentry-options";

// Server and edge error tracking (production readiness phase 3). Inert
// unless SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN) is set; every event passes
// through lib/monitoring/scrub.ts first.
export function register() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  // Not even initialised without a DSN: no hooks, no overhead, no log noise.
  if (dsn && (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge")) {
    Sentry.init(sentryOptions(dsn));
  }
}

// Uncaught errors in route handlers, server components and proxy.ts.
export const onRequestError = Sentry.captureRequestError;

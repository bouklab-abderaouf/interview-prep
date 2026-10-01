import { scrubBreadcrumb, scrubEvent } from "@/lib/monitoring/scrub";

// Shared Sentry.init options for the browser, Node and edge runtimes.
// Inert without a DSN, so local dev and the test suites send nothing.
export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // Errors only: no performance tracing, no session replay (a replay would
    // record transcripts on screen).
    tracesSampleRate: 0,
    sendDefaultPii: false,
    maxBreadcrumbs: 30,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

/** The ingest origin of a DSN, for the CSP's connect-src. */
export function sentryIngestOrigin(dsn: string | undefined): string[] {
  if (!dsn) return [];
  try {
    return [new URL(dsn).origin];
  } catch {
    return [];
  }
}

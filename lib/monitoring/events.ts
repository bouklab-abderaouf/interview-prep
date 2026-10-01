import * as Sentry from "@sentry/nextjs";

// Named events for the failure modes and abuse signals worth an alert
// (production readiness phase 3). Each is a Sentry message with tags, never
// free text: tag values are short codes (an HTTP status, a close code, a
// limit kind), so nothing personal can ride along. A no-op until Sentry is
// configured with a DSN (instrumentation.ts / instrumentation-client.ts).

const EVENTS = {
  // The Live interview (browser)
  "live.watchdog_silence": "warning", // no reply 12s after the candidate stopped — quota or outage
  "live.closed_abnormally": "error", // socket closed with a non-1000 code (1011 = quota)
  "live.token_refused": "warning", // the token route said no (limit, locked stage, …)
  "live.mic_error": "info", // permission denied, no device — counts, not bugs
  "session.flush_failed": "error", // turns couldn't be saved
  "session.scoring_failed": "error",
  "analysis.failed": "error",
  // Server-side spend and abuse signals
  "token.mint_failed": "error",
  "guardrail.kill_switch_tripped": "warning", // the demo turned itself off for the day
  "guardrail.ip_rate_limited": "info",
  "guardrail.turnstile_failed": "info",
  "limits.daily_limit_hit": "info", // a spike of these = someone hammering the API
  "limits.unavailable": "error", // the limit check itself is down; everything fails closed
} as const satisfies Record<string, "info" | "warning" | "error">;

export type MonitoredEvent = keyof typeof EVENTS;

type TagValue = string | number | boolean | null | undefined;

export function reportEvent(name: MonitoredEvent, tags: Record<string, TagValue> = {}): void {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (value === undefined || value === null) continue;
    clean[key] = String(value).slice(0, 64);
  }
  try {
    Sentry.captureMessage(name, {
      level: EVENTS[name],
      tags: { event: name, ...clean },
      // Group by event (and limit kind / status), not by wording.
      fingerprint: [name, clean.kind ?? clean.status ?? clean.code ?? ""],
    });
  } catch {
    // Monitoring must never break the thing it monitors.
  }
}

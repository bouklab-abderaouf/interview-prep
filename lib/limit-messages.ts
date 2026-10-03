import { formatInstant } from "@/lib/format";

// Client-safe wording for the API's quota refusals (lib/limits.ts). Shared by
// every screen that can hit one, so the message is the same everywhere.

const NOUNS: Record<string, string> = {
  analysis: "CV analyses",
  scoring: "scorings",
  interview_token: "interviews",
  drill_token: "drills",
  session_create: "new sessions",
};

interface RefusalBody {
  error?: string;
  kind?: string;
  limit?: number;
  resetsAt?: string;
}

/**
 * A sentence for a daily-limit or limits-unavailable refusal, or null if the
 * body is something else. `timeZone` undefined = the viewer's own zone, so
 * call it from the browser.
 */
export function describeLimitRefusal(body: unknown, timeZone?: string): string | null {
  if (!body || typeof body !== "object") return null;
  const { error, kind, limit, resetsAt } = body as RefusalBody;

  if (error === "limits_unavailable") {
    return "Usage limits can't be checked right now, so nothing was started. Try again in a minute.";
  }
  if (error !== "daily_limit") return null;

  const noun = (kind && NOUNS[kind]) ?? "requests";
  const reset = resetsAt ? ` It resets at ${formatInstant(resetsAt, "time", timeZone)}.` : "";
  return `You've reached today's limit${typeof limit === "number" ? ` of ${limit} ${noun}` : ` for ${noun}`}.${reset}`;
}

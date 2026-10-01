// Why a Gemini Live socket closed, in terms a candidate can act on
// (production readiness phase 4). Google doesn't document the close codes
// for quota or concurrency limits, so this matches on what has actually been
// seen — `1011 "You exceeded your current quota"` (AGENTS.md §2) — plus the
// standard WebSocket codes, and falls back to "other" with the code shown.

export type LiveCloseKind = "normal" | "quota" | "busy" | "expired" | "network" | "server_error" | "other";

export function classifyLiveClose(code: number, reason = ""): LiveCloseKind {
  if (code === 1000) return "normal";
  if (/quota|exceeded|resource[_ ]?exhausted|rate.?limit/i.test(reason)) return "quota";
  if (code === 1013 || /concurrent|too many (sessions|connections|requests)|try again later|overloaded|unavailable/i.test(reason)) {
    return "busy";
  }
  if (/expired|deadline|session (time|length|duration)/i.test(reason)) return "expired";
  if (code === 1006) return "network";
  if (code === 1011) return "server_error";
  return "other";
}

const MESSAGES: Record<Exclude<LiveCloseKind, "normal">, string> = {
  quota: "The voice service has hit its usage limit for now. Try again later.",
  busy: "The interviewer is busy with other sessions right now. Try again in a minute.",
  expired: "The interview reached its time limit and the connection closed.",
  network: "The connection dropped. Check your internet connection, then start again.",
  server_error: "The voice service had an internal error. Try again in a minute.",
  other: "The connection to the voice service closed unexpectedly.",
};

/** A sentence for the candidate, or null for a normal close. */
export function describeLiveClose(code: number, reason = ""): string | null {
  const kind = classifyLiveClose(code, reason);
  if (kind === "normal") return null;
  return kind === "other" ? `${MESSAGES.other} (code ${code})` : MESSAGES[kind];
}

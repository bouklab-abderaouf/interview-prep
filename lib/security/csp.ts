// Content Security Policy, built per request by proxy.ts with a fresh nonce.
// Next.js reads the nonce back from the request header and puts it on its
// own scripts (node_modules/next/dist/docs/01-app/02-guides/
// content-security-policy.md), so pages need no changes.
//
// What each external origin is for:
// - Supabase: the browser client (sign-in, storage links).
// - generativelanguage.googleapis.com: the Gemini Live WebSocket, opened
//   straight from the browser with an ephemeral token.
// - challenges.cloudflare.com: Turnstile (script, iframe, and its XHRs).
//
// Scripts use a nonce plus 'strict-dynamic': Next's chunks, the Turnstile
// loader and the AudioWorklet module are all loaded by trusted script, so
// they're allowed without listing hosts. Styles stay 'unsafe-inline' because
// React server-renders style="" attributes, which a nonce cannot cover (and
// browsers ignore 'unsafe-inline' as soon as a style nonce is present).

export interface CspOptions {
  nonce: string;
  /** next dev: React needs eval for its error overlay; no HTTPS upgrade. */
  dev: boolean;
  /** NEXT_PUBLIC_SUPABASE_URL */
  supabaseUrl?: string;
  /** Extra connect-src origins (e.g. an error tracker's ingest host). */
  extraConnect?: string[];
  /** Add upgrade-insecure-requests (only when actually served over HTTPS). */
  https: boolean;
}

const GEMINI = ["https://generativelanguage.googleapis.com", "wss://generativelanguage.googleapis.com"];
const TURNSTILE = "https://challenges.cloudflare.com";

function origin(url: string | undefined): string[] {
  if (!url) return [];
  try {
    const { protocol, host } = new URL(url);
    const ws = protocol === "https:" ? "wss:" : "ws:";
    return [`${protocol}//${host}`, `${ws}//${host}`];
  } catch {
    return [];
  }
}

export function buildContentSecurityPolicy({ nonce, dev, supabaseUrl, extraConnect = [], https }: CspOptions): string {
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      // The host is a fallback for browsers without 'strict-dynamic' (CSP2).
      ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", TURNSTILE, ...(dev ? ["'unsafe-eval'"] : [])],
    ],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'"]],
    ["media-src", ["'self'", "blob:"]],
    ["connect-src", ["'self'", ...origin(supabaseUrl), ...GEMINI, TURNSTILE, ...extraConnect]],
    ["frame-src", [TURNSTILE]],
    ["worker-src", ["'self'", "blob:"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];

  const policy = directives.map(([name, values]) => `${name} ${[...new Set(values)].join(" ")}`);
  if (https && !dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/** 128 bits from the platform CSPRNG, base64 — fresh per request. */
export function createNonce(): string {
  return btoa(crypto.randomUUID());
}

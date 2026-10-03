import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

// Everything sent to the error tracker passes through here first. The app
// handles CVs, voice transcripts and emails; none of that may leave the
// server or the browser in an error report (production readiness phases 3
// and 5). Allow-list, not block-list: what isn't known to be safe is dropped.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
// Magic-link and OAuth codes travel in query strings.
const SECRET_PARAMS = /([?&](?:code|token|token_hash|access_token|refresh_token|key|apikey)=)[^&#\s]+/gi;

/** Strips emails, tokens and secret query params from free text. */
export function redact(text: string): string {
  return text.replace(EMAIL, "[email]").replace(JWT, "[token]").replace(SECRET_PARAMS, "$1[redacted]");
}

/** A URL without its query string or fragment (both can carry secrets or personal data). */
export function stripQuery(url: string): string {
  return url.split(/[?#]/, 1)[0];
}

// SDK-generated environment details only; anything an app might attach
// (`extra`, custom contexts) is dropped.
const SAFE_CONTEXTS = new Set(["os", "browser", "runtime", "device", "trace", "app", "culture", "cloud_resource", "nextjs"]);

export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  delete event.user;
  delete event.extra;
  delete event.server_name;

  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url ? stripQuery(event.request.url) : undefined,
    };
  }

  if (event.contexts) {
    event.contexts = Object.fromEntries(Object.entries(event.contexts).filter(([name]) => SAFE_CONTEXTS.has(name)));
  }

  if (event.message) event.message = redact(event.message);
  if (event.transaction) event.transaction = stripQuery(event.transaction);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redact(exception.value);
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((crumb) => scrubBreadcrumb(crumb))
      .filter((crumb): crumb is Breadcrumb => crumb !== null);
  }
  return event;
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  // Console output in this app includes transcripts and Live session
  // payloads; it never goes out.
  if (crumb.category === "console") return null;

  const scrubbed: Breadcrumb = { ...crumb };
  if (scrubbed.message) scrubbed.message = redact(scrubbed.message);

  if (scrubbed.data) {
    const data: Record<string, unknown> = {};
    for (const key of ["url", "from", "to", "method", "status_code"]) {
      const value = scrubbed.data[key];
      if (value === undefined) continue;
      data[key] = typeof value === "string" ? stripQuery(redact(value)) : value;
    }
    scrubbed.data = data;
  }
  return scrubbed;
}

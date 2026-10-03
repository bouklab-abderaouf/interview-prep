import type { ErrorEvent } from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureMessage }));

const { redact, scrubBreadcrumb, scrubEvent, stripQuery } = await import("@/lib/monitoring/scrub");
const { reportEvent } = await import("@/lib/monitoring/events");
const { sentryIngestOrigin, sentryOptions } = await import("@/lib/monitoring/sentry-options");

// A JWT-shaped string that is not a token: an unsigned header, a dummy
// payload and the word "fake-signature", all base64url. Joined at runtime so
// secret scanners don't flag a literal token in the repository.
const NOT_A_TOKEN = ["eyJhbGciOiJub25lIn0", "eyJzdWIiOiJ0ZXN0LXVzZXIifQ", "ZmFrZS1zaWduYXR1cmU"].join(".");

describe("redact", () => {
  it("removes emails, JWTs and secret query params from free text", () => {
    const text = `Login failed for candidate@example.com with ${NOT_A_TOKEN} at /auth/confirm?code=abc123&next=/home`;
    const out = redact(text);
    expect(out).not.toContain("candidate@example.com");
    expect(out).not.toContain(NOT_A_TOKEN);
    expect(out).not.toContain("abc123");
    expect(out).toContain("[email]");
    expect(out).toContain("code=[redacted]");
    expect(out).toContain("next=/home");
  });

  it("strips query strings and fragments from URLs", () => {
    expect(stripQuery("https://x.dev/sign-in?error=link#top")).toBe("https://x.dev/sign-in");
  });
});

describe("scrubEvent", () => {
  const event = (): ErrorEvent =>
    ({
      type: undefined,
      message: "Scoring failed for candidate@example.com",
      user: { id: "6717e87d", email: "candidate@example.com", ip_address: "1.2.3.4" },
      extra: { transcript: "I worked at Celad on RAG…" },
      server_name: "my-laptop",
      request: {
        method: "POST",
        url: "https://app.dev/auth/confirm?code=secret",
        data: { cv: "%PDF-…" },
        cookies: { "sb-access-token": "eyJ…" },
        headers: { cookie: "sb=…", authorization: "Bearer x" },
        query_string: "code=secret",
      },
      contexts: { os: { name: "Windows" }, interview: { transcript: "…" } },
      exception: { values: [{ type: "Error", value: "Failed for candidate@example.com" }] },
      breadcrumbs: [
        { category: "console", message: "[live session] transcript: I worked at…" },
        { category: "fetch", data: { url: "/api/sessions/1?x=1", method: "PATCH", status_code: 200, request_body: "{turns}" } },
        { category: "navigation", data: { from: "/sign-in?error=link", to: "/home" } },
      ],
    }) as unknown as ErrorEvent;

  it("drops the user, extras, request bodies, cookies, headers and query strings", () => {
    const out = scrubEvent(event())!;
    expect(out.user).toBeUndefined();
    expect(out.extra).toBeUndefined();
    expect(out.server_name).toBeUndefined();
    expect(out.request).toEqual({ method: "POST", url: "https://app.dev/auth/confirm" });
  });

  it("keeps only SDK environment contexts", () => {
    expect(Object.keys(scrubEvent(event())!.contexts!)).toEqual(["os"]);
  });

  it("redacts messages and exception values", () => {
    const out = scrubEvent(event())!;
    expect(out.message).toBe("Scoring failed for [email]");
    expect(out.exception!.values![0].value).toBe("Failed for [email]");
  });

  it("drops console breadcrumbs (they carry transcripts) and strips the rest to safe fields", () => {
    const out = scrubEvent(event())!;
    expect(out.breadcrumbs).toEqual([
      { category: "fetch", data: { url: "/api/sessions/1", method: "PATCH", status_code: 200 } },
      { category: "navigation", data: { from: "/sign-in", to: "/home" } },
    ]);
  });

  it("does the same to breadcrumbs as they're recorded", () => {
    expect(scrubBreadcrumb({ category: "console", message: "anything" })).toBeNull();
  });
});

describe("reportEvent", () => {
  // Braces matter: a function returned from beforeEach is run as a teardown.
  beforeEach(() => {
    captureMessage.mockReset();
  });

  it("sends a named message with short tag values and a stable fingerprint", () => {
    reportEvent("limits.daily_limit_hit", { kind: "analysis", limit: 3, missing: undefined });
    expect(captureMessage).toHaveBeenCalledWith("limits.daily_limit_hit", {
      level: "info",
      tags: { event: "limits.daily_limit_hit", kind: "analysis", limit: "3" },
      fingerprint: ["limits.daily_limit_hit", "analysis"],
    });
  });

  it("caps tag values so free text can't ride along", () => {
    reportEvent("live.token_refused", { error: "x".repeat(500) });
    expect(captureMessage.mock.calls[0][1].tags.error).toHaveLength(64);
  });

  it("never throws, even if the tracker does", () => {
    captureMessage.mockImplementation(() => {
      throw new Error("tracker down");
    });
    expect(() => reportEvent("analysis.failed", { status: 503 })).not.toThrow();
    expect(captureMessage).toHaveBeenCalledOnce();
  });
});

describe("sentryOptions", () => {
  it("is disabled without a DSN, and never sends PII, traces or console output", () => {
    const options = sentryOptions(undefined);
    expect(options.enabled).toBe(false);
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
    expect(options.beforeBreadcrumb({ category: "console", message: "x" })).toBeNull();
  });

  it("derives the ingest origin for the CSP", () => {
    expect(sentryIngestOrigin("https://abc123@o456.ingest.de.sentry.io/789")).toEqual(["https://o456.ingest.de.sentry.io"]);
    expect(sentryIngestOrigin("not a dsn")).toEqual([]);
    expect(sentryIngestOrigin(undefined)).toEqual([]);
  });
});

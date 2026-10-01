import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, createNonce } from "@/lib/security/csp";

const parse = (policy: string) =>
  Object.fromEntries(
    policy.split("; ").map((directive) => {
      const [name, ...values] = directive.split(" ");
      return [name, values];
    }),
  );

const base = { nonce: "abc123", dev: false, supabaseUrl: "https://ref.supabase.co", https: true };

describe("buildContentSecurityPolicy", () => {
  it("allows scripts only by nonce (plus what trusted scripts load)", () => {
    const csp = parse(buildContentSecurityPolicy(base));
    expect(csp["script-src"]).toEqual(
      expect.arrayContaining(["'nonce-abc123'", "'strict-dynamic'"]),
    );
    expect(csp["script-src"]).not.toContain("'unsafe-inline'");
    expect(csp["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("allows eval only in development (React's error overlay)", () => {
    expect(parse(buildContentSecurityPolicy({ ...base, dev: true }))["script-src"]).toContain("'unsafe-eval'");
  });

  it("lets the browser reach exactly Supabase, Gemini Live and Turnstile", () => {
    const csp = parse(buildContentSecurityPolicy(base));
    expect(csp["connect-src"]).toEqual([
      "'self'",
      "https://ref.supabase.co",
      "wss://ref.supabase.co",
      "https://generativelanguage.googleapis.com",
      "wss://generativelanguage.googleapis.com",
      "https://challenges.cloudflare.com",
    ]);
    expect(csp["frame-src"]).toEqual(["https://challenges.cloudflare.com"]);
  });

  it("can't be framed, can't load plugins, can't rebase or post elsewhere", () => {
    const csp = parse(buildContentSecurityPolicy(base));
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
  });

  it("upgrades insecure requests only when actually on HTTPS in production", () => {
    expect(buildContentSecurityPolicy(base)).toContain("upgrade-insecure-requests");
    expect(buildContentSecurityPolicy({ ...base, https: false })).not.toContain("upgrade-insecure-requests");
    expect(buildContentSecurityPolicy({ ...base, dev: true })).not.toContain("upgrade-insecure-requests");
  });

  it("adds extra connect origins without duplicates, and survives a bad Supabase URL", () => {
    const csp = parse(
      buildContentSecurityPolicy({ ...base, supabaseUrl: "not a url", extraConnect: ["https://o1.ingest.de.sentry.io", "'self'"] }),
    );
    expect(csp["connect-src"]).toContain("https://o1.ingest.de.sentry.io");
    expect(csp["connect-src"].filter((v: string) => v === "'self'")).toHaveLength(1);
  });
});

describe("createNonce", () => {
  it("is fresh and base64 every time", () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(a).not.toBe(createNonce());
  });
});

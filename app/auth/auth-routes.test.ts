import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));

const { GET: confirm } = await import("@/app/auth/confirm/route");
const { POST: signOut } = await import("@/app/auth/sign-out/route");
const { redirectToPath } = await import("@/lib/redirect");

// What a self-hosted server sees behind a tunnel: the address it listens on,
// not the one the browser used. Redirects must not be built from it.
const INTERNAL = "https://0.0.0.0:3000";
const confirmAt = (query: string) => confirm(new NextRequest(`${INTERNAL}/auth/confirm${query}`));

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
    auth.verifyOtp.mockReset().mockResolvedValue({ error: null });
  });

  it("signs in with a PKCE code and lands on /home, relative to the browser's host", async () => {
    const res = await confirmAt("?code=abc");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/home");
  });

  it("signs in with a token hash", async () => {
    const res = await confirmAt("?token_hash=h&type=email");
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "h" });
    expect(res.headers.get("location")).toBe("/home");
  });

  it.each([
    ["pkce_code_verifier_not_found", "browser"],
    ["otp_expired", "expired"],
    ["something_else", "link"],
  ])("sends a failed %s back to sign-in with reason %s", async (code, reason) => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: { code } });
    const res = await confirmAt("?code=abc");
    expect(res.headers.get("location")).toBe(`/sign-in?error=${reason}`);
  });

  it("reads Supabase's own error_code when there's no code at all", async () => {
    expect((await confirmAt("?error_code=otp_expired")).headers.get("location")).toBe("/sign-in?error=expired");
    expect((await confirmAt("")).headers.get("location")).toBe("/sign-in?error=link");
  });
});

describe("POST /auth/sign-out", () => {
  it("signs out and sends the browser to / with a GET", async () => {
    auth.signOut.mockReset().mockResolvedValue({ error: null });
    const res = await signOut();
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
  });
});

describe("redirectToPath", () => {
  it.each(["//evil.example", "/\\evil.example", "https://evil.example/", "home"])("refuses %s", (path) => {
    expect(() => redirectToPath(path)).toThrow();
  });
});

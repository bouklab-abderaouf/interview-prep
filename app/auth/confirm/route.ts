import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Phase 2 — exchanges a magic-link redirect for a session. Handles both
// shapes Supabase can send here, since which one shows up depends on the
// Auth email template rather than anything in this app:
// - `code` (PKCE): the *default* behavior — Supabase's hosted
//   /auth/v1/verify page verifies the token itself, then redirects here
//   with ?code=..., exchanged via exchangeCodeForSession. Confirmed live:
//   the actual email link is
//   https://<project>.supabase.co/auth/v1/verify?token=pkce_...&type=magiclink&redirect_to=...
//   — i.e. it never reaches this route with token_hash/type at all unless
//   the email template is manually changed to bypass Supabase's hosted page.
// - `token_hash` + `type`: verifyOtp, current pattern if the dashboard's
//   Magic Link template is changed to
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email.
// Supporting both means this works with Supabase's out-of-the-box template,
// no dashboard edit required.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const redirectTo = request.nextUrl.clone();
  // Land on the hub, not /onboarding — that page builds a *new* roadmap
  // every time, which is wrong for anyone signing back in. /home sends
  // genuinely-new users on to onboarding itself.
  redirectTo.pathname = "/home";
  redirectTo.search = "";

  const supabase = await createClient();

  // Supabase's hosted /verify page reports its own failures (e.g. an expired
  // link) as ?error_code=... instead of a code.
  let errorCode = searchParams.get("error_code");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(redirectTo);
    errorCode = error.code ?? error.message;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(redirectTo);
    errorCode = error.code ?? error.message;
  }

  console.error("[auth/confirm] sign-in link failed:", errorCode ?? "no code or token_hash");

  // Tell /sign-in which failure it was. "browser" is the PKCE one: the code
  // verifier lives in a cookie of the browser that requested the link, so
  // the link fails if opened elsewhere, if a newer request replaced the
  // verifier, or if the request errored client-side (supabase-js deletes the
  // verifier on any error, even when Supabase did send the email).
  const reason =
    errorCode === "pkce_code_verifier_not_found" || errorCode === "bad_code_verifier"
      ? "browser"
      : errorCode === "otp_expired" || errorCode === "flow_state_expired"
        ? "expired"
        : "link";
  redirectTo.pathname = "/sign-in";
  redirectTo.search = `?error=${reason}`;
  return NextResponse.redirect(redirectTo);
}

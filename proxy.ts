import { type NextRequest } from "next/server";

import { buildContentSecurityPolicy, createNonce } from "@/lib/security/csp";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 renamed the `middleware.ts` convention to `proxy.ts` — same
// mechanism, just a rename. Two jobs: refresh the Supabase session and guard
// app routes (lib/supabase/proxy.ts), and send a per-request Content Security
// Policy (lib/security/csp.ts).
//
// CSP_REPORT_ONLY=1 sends the same policy as report-only: the escape hatch if
// it ever blocks something real (e.g. in the interview room) — the page keeps
// working while the console names what would have been blocked.
export async function proxy(request: NextRequest) {
  const dev = process.env.NODE_ENV === "development";
  const policy = buildContentSecurityPolicy({
    nonce: createNonce(),
    dev,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    https: request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
  });
  const header =
    process.env.CSP_REPORT_ONLY === "1" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";

  const response = await updateSession(request, { [header]: policy });
  response.headers.set(header, policy);
  return response;
}

export const config = {
  matcher: [
    // Skip static files, image optimization, and favicon — running auth
    // logic on these would unintentionally block assets from loading.
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

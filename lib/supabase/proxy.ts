import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Phase 2 — refreshes the auth session cookie on every request (Next.js 16
// calls this file's convention `proxy.ts`, not `middleware.ts` — renamed in
// v16, same mechanism). Protects the authenticated app routes by redirecting
// to /sign-in; API routes still verify auth themselves rather than relying
// on this alone, per Next's own guidance that a matcher change could
// silently drop coverage.
const PROTECTED_PREFIXES = ["/onboarding", "/roadmap", "/session", "/scorecard"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          // Auth-cookie responses must never be CDN/reverse-proxy cached —
          // otherwise one user's session token can be served to another.
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims(): a mistake
  // here can randomly log users out. getClaims() validates the JWT
  // signature — getSession()'s user object must not be trusted server-side.
  const { data } = await supabase.auth.getClaims();

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix),
  );

  if (isProtected && !data?.claims) {
    // Not threading a "return to X" param through: the magic-link email
    // template would need dashboard config to forward it, and the only
    // protected destination in the current UI is /onboarding anyway.
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

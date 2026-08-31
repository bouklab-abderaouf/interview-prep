import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Supabase client (anon key, cookie-based session) for Server
// Components and Route Handlers. setAll can throw when called from a Server
// Component (cookies are read-only there) — safe to ignore since proxy.ts
// refreshes the session cookie on every request.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — ignore, proxy.ts handles refresh.
          }
        },
      },
    },
  );
}

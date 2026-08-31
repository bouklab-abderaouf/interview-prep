import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// Phase 2 — defensive auth guard. proxy.ts already redirects unauthenticated
// requests to protected paths, but Next's own guidance is not to rely on
// Proxy alone (a matcher change could silently drop coverage) — verify here
// too.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/sign-in");
  }

  return (
    <>
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <span className="text-sm text-zinc-500">{data.claims.email}</span>
        <form action="/auth/sign-out" method="post">
          <button type="submit" className="text-sm underline">
            Sign out
          </button>
        </form>
      </header>
      {children}
    </>
  );
}

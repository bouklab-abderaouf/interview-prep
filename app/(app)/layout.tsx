import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/nav/AppNav";

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
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-6 border-b border-zinc-200 bg-white/80 px-6 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <Link href="/home" className="font-semibold tracking-tight">
          Interview Prep
        </Link>

        <AppNav />

        <div className="ml-auto flex items-center gap-4">
          <span className="hidden text-sm text-zinc-500 sm:inline">{data.claims.email}</span>
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";

import { isLinkError } from "@/components/auth/link-errors";
import { SignInForm } from "@/components/auth/SignInForm";
import { createClient } from "@/lib/supabase/server";

const PERKS = [
  {
    title: "Interviewers built from your CV",
    body: "Each stage targets the real gaps between your experience and the role.",
  },
  {
    title: "Spoken, not typed",
    body: "A live voice interview you can interrupt, just like the real thing.",
  },
  {
    title: "A scorecard after every session",
    body: "STAR breakdown, pacing and filler words, with model answers from your own story.",
  },
];

// Phase 2 — magic-link sign-in. Lives in the (marketing) group so it gets the
// public header: it used to be a bare form on an empty page with no way back.
// Already signed in? There's nothing to do here, so go straight to the hub.
export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/home");

  // /auth/confirm sends people back here with ?error=browser|expired|link
  // when a magic link fails.
  const { error } = await searchParams;
  const linkError = isLinkError(error) ? error : null;

  return (
    <main className="relative flex flex-1 items-start justify-center overflow-hidden px-4 py-10 sm:px-6 sm:py-16 lg:items-center lg:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.14),transparent_65%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.18),transparent_65%)]"
      />

      <div className="grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[1fr_minmax(0,420px)] lg:gap-20">
        <section className="hidden flex-col gap-8 lg:flex">
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl font-semibold tracking-tight">
              Pick up where you left off.
            </h1>
            <p className="max-w-md text-zinc-500 dark:text-zinc-400">
              Your roadmap, streak and scorecards are waiting. New here? The same link
              creates your account.
            </p>
          </div>

          <ul className="flex flex-col gap-5">
            {PERKS.map((perk) => (
              <li key={perk.title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="font-medium">{perk.title}</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{perk.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex w-full flex-col gap-6">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-900/5 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-black/30">
            <SignInForm linkError={linkError} />
          </div>

          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            Just looking?{" "}
            <Link href="/demo" className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100">
              Try the 2-minute demo
            </Link>{" "}
            — no account needed.
          </p>
        </div>
      </div>
    </main>
  );
}

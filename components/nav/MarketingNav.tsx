"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/nav/BrandMark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { ThemePreference } from "@/lib/theme";

const REPO_URL = "https://github.com/bouklab-abderaouf/interview-prep";

const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/sample-scorecard", label: "Sample scorecard" },
  { href: "/demo", label: "Live demo" },
];

// Public header for the landing page and /sample-scorecard. The landing page
// used to have nothing but an underlined "Sign in" floating top-right, and the
// sample scorecard had no way back at all. Client component for the active
// link and the mobile menu; whether the visitor is signed in is decided on
// the server and passed down, so the right button renders on first paint.
export function MarketingNav({ signedIn, theme }: { signedIn: boolean; theme: ThemePreference }) {
  const pathname = usePathname();
  // A client-side navigation keeps this layout mounted, so a plain boolean
  // would leave the menu open over the page it just navigated to. Remembering
  // which page it was opened on closes it on navigation for free.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const menuOpen = menuOpenOn === pathname;

  const cta = signedIn
    ? { href: "/home", label: "Open app" }
    : { href: "/onboarding", label: "Get started" };

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/75">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-8 px-4 sm:px-6">
        <BrandMark href="/" />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "font-medium text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle initial={theme} />

          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Source code on GitHub"
            className="hidden rounded-md p-2 text-zinc-500 transition-colors hover:text-zinc-900 sm:inline-flex dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <GitHubIcon />
          </a>

          {!signedIn && (
            <Link
              href="/sign-in"
              className="hidden rounded-md px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900 sm:inline-flex dark:text-zinc-300 dark:hover:text-white"
            >
              Sign in
            </Link>
          )}

          <Link
            href={cta.href}
            className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {cta.label}
            <span aria-hidden>&rarr;</span>
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpenOn(menuOpen ? null : pathname)}
            aria-expanded={menuOpen}
            aria-controls="marketing-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="inline-flex rounded-md p-2 text-zinc-600 md:hidden dark:text-zinc-300"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
              {menuOpen ? (
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="marketing-menu"
          aria-label="Main"
          className="border-t border-zinc-200 px-4 py-3 md:hidden dark:border-zinc-800"
        >
          <ul className="flex flex-col">
            {LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className="block rounded-md px-2 py-2.5 text-sm text-zinc-700 dark:text-zinc-200">
                  {label}
                </Link>
              </li>
            ))}
            {!signedIn && (
              <li>
                <Link href="/sign-in" className="block rounded-md px-2 py-2.5 text-sm text-zinc-700 dark:text-zinc-200">
                  Sign in
                </Link>
              </li>
            )}
            <li>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md px-2 py-2.5 text-sm text-zinc-700 dark:text-zinc-200"
              >
                <GitHubIcon /> GitHub
              </a>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

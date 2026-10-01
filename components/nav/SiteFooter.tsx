import Link from "next/link";

// Every page links to the privacy policy and the legal notice (GDPR
// transparency, French LCEN). Shared by the public and signed-in layouts.
export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      <nav aria-label="Legal" className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 sm:px-2">
        <span>Interview Prep</span>
        <Link href="/privacy" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">
          Privacy
        </Link>
        <Link href="/legal" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">
          Legal notice
        </Link>
      </nav>
    </footer>
  );
}

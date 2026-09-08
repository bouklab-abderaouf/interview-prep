import Link from "next/link";

interface BackLinkProps {
  href: string;
  children: React.ReactNode;
}

// Always an explicit destination, never router.back(). A scorecard can be
// arrived at from the interview room (via a redirect, so history.back() would
// bounce into a dead session) or from the history list, and only the page
// itself knows where "up" actually is.
export function BackLink({ href, children }: BackLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
    >
      <span aria-hidden>&larr;</span>
      {children}
    </Link>
  );
}

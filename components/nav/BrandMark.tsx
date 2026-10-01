import Link from "next/link";

// The product's mark: a small voice waveform, because the whole thing is a
// spoken interview. Shared by the marketing header and the app shell so the
// brand reads the same signed in or out.
export function BrandMark({ href }: { href: string }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white" aria-hidden>
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
          <rect x="1.5" y="6" width="2" height="4" rx="1" />
          <rect x="5" y="3.5" width="2" height="9" rx="1" />
          <rect x="8.5" y="1.5" width="2" height="13" rx="1" />
          <rect x="12" y="5" width="2" height="6" rx="1" />
        </svg>
      </span>
      Interview Prep
    </Link>
  );
}

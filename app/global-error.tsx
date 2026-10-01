"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

// Replaces the root layout when it (or anything above a segment's own error
// boundary) throws — so no global styles here, only inline ones. Reports the
// crash, then offers a retry.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          <p style={{ color: "#52525b" }}>
            The error has been reported. Try again, or go back to the home page.
          </p>
          <p style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button type="button" onClick={() => retry()}>
              Try again
            </button>
            <Link href="/">Home</Link>
          </p>
        </main>
      </body>
    </html>
  );
}

"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { LINK_ERRORS, type LinkError } from "@/components/auth/link-errors";
import { createClient } from "@/lib/supabase/client";

// Supabase allows one magic-link email per address per 60s by default; a
// resend inside that window just fails, so the button waits it out instead.
const RESEND_COOLDOWN_S = 60;

// Phase 2 — magic-link sign-in. Not in specs §1's original tree (auth wasn't
// a dedicated phase there), but §6.1's "Auth check. Reject anonymous." needs
// somewhere for that anonymous user to go.
export function SignInForm({ linkError }: { linkError: LinkError | null }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  // Set once a link has gone out; a failed resend leaves it alone, since the
  // first link is still valid.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendLink = async () => {
    setSending(true);
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    setSending(false);
    if (error) {
      setErrorMessage(describeSendError(error));
      return;
    }

    setSentTo(email);
    setCooldown(RESEND_COOLDOWN_S);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendLink();
  };

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3.5 6.5l8.5 6 8.5-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        <div className="flex flex-col gap-2" role="status">
          <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            We sent a sign-in link to{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{sentTo}</span>.
            Open it in this browser to sign in.
          </p>
        </div>

        {errorMessage && <ErrorNote>{errorMessage}</ErrorNote>}

        <div className="flex w-full flex-col gap-2 border-t border-zinc-200 pt-5 text-sm dark:border-zinc-800">
          <p className="text-zinc-500 dark:text-zinc-400">Nothing yet? Check your spam folder, or</p>
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => void sendLink()}
              disabled={cooldown > 0 || sending}
              className="font-medium text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-zinc-400 disabled:no-underline dark:text-blue-400 dark:disabled:text-zinc-500"
            >
              {sending
                ? "Sending..."
                : cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : "Resend link"}
            </button>
            <span className="text-zinc-300 dark:text-zinc-700" aria-hidden>|</span>
            <button
              type="button"
              onClick={() => {
                setSentTo(null);
                setErrorMessage(null);
              }}
              className="font-medium text-zinc-700 hover:underline dark:text-zinc-300"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in or create an account</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Enter your email and we&apos;ll send you a link. No password needed.
        </p>
      </div>

      {linkError && !errorMessage && <ErrorNote>{LINK_ERRORS[linkError]}</ErrorNote>}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="h-11 rounded-lg border border-zinc-300 bg-white px-3.5 text-sm outline-none transition-shadow placeholder:text-zinc-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/15 dark:border-zinc-700 dark:bg-zinc-950 dark:placeholder:text-zinc-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20"
        />
      </div>

      {errorMessage && <ErrorNote>{errorMessage}</ErrorNote>}

      <button
        type="submit"
        disabled={sending}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {sending ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            Sending link...
          </>
        ) : (
          <>
            Email me a sign-in link
            <span aria-hidden>&rarr;</span>
          </>
        )}
      </button>

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        You can delete your account and everything in it at any time from Documents.
      </p>
    </form>
  );
}

function describeSendError(error: { status?: number; message: string }): string {
  if (error.status === 429) return "Too many sign-in emails. Wait a minute, then try again.";
  // "Failed to fetch": the browser never got Supabase's reply. The request
  // often did go through (seen in the auth logs: email sent, browser still
  // errored), and supabase-js has already dropped this attempt's verifier,
  // so that email's link would fail here. Say both.
  if (error.message === "Failed to fetch" || error.message.includes("NetworkError")) {
    return "Couldn't reach the sign-in server. Check your connection, or pause any ad blocker or antivirus web protection for this site, then wait a minute and try again. If an email from this attempt arrives, don't use it.";
  }
  return error.message;
}

function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-left text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
    >
      {children}
    </p>
  );
}

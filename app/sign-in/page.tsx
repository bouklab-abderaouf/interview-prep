"use client";

import { useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";

// Phase 2 — magic-link sign-in. Not in specs §1's original tree (auth wasn't
// a dedicated phase there), but §6.1's "Auth check. Reject anonymous." needs
// somewhere for that anonymous user to go.
export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setStatus("error");
      return;
    }

    setStatus("sent");
  };

  if (status === "sent") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-16 text-center">
        <h1 className="text-xl font-medium">Check your email</h1>
        <p className="text-zinc-500">We sent a sign-in link to {email}.</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-16">
      <h1 className="text-xl font-medium">Sign in</h1>
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="rounded border border-zinc-400 px-3 py-2"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {status === "sending" ? "Sending..." : "Send magic link"}
        </button>
        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      </form>
    </main>
  );
}

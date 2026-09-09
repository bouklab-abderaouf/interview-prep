"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ScoreSessionButtonProps {
  sessionId: string;
  label?: string;
}

// A completed interview whose scoring call failed used to be a dead end: the
// turns were safely in Postgres, but nothing in the app could ask for a
// scorecard again, so one transient Gemini 503 permanently cost an 11-minute
// session its result. Scoring is idempotent server-side, so this is safe to
// press repeatedly and safe to offer on any unscored session.
export function ScoreSessionButton({ sessionId, label = "Score this interview" }: ScoreSessionButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "scoring" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClick = async () => {
    setStatus("scoring");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/score`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(
          body.error === "scoring_failed"
            ? "The scoring model is busy right now. Your interview is saved — try again in a minute."
            : (body.error ?? `scoring failed with ${res.status}`),
        );
      }
      router.push(`/scorecard/${sessionId}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatus("error");
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "scoring"}
        className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {status === "scoring" ? "Scoring…" : label}
      </button>
      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
    </div>
  );
}

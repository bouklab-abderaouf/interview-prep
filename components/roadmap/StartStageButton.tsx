"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface StartStageButtonProps {
  stageId: string;
  /** Defaults to "Start"; the scorecard reuses this as a retry action. */
  label?: string;
}

// specs §8.1 — the skill tree's "Start" action. POST /api/sessions, then
// navigate to the interview room. Kept as its own client component so the
// sheet around it stays presentational.
export function StartStageButton({ stageId, label = "Start" }: StartStageButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "starting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClick = async () => {
    setStatus("starting");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId }),
      });
      const body = await res.json().catch(() => ({}) as { sessionId?: string; error?: string });
      if (!res.ok || !body.sessionId) {
        throw new Error(body.error ?? `sessions endpoint returned ${res.status}`);
      }
      router.push(`/session/${body.sessionId}?stageId=${stageId}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatus("error");
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "starting"}
        className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {status === "starting" ? "Starting..." : label}
      </button>
      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
    </div>
  );
}

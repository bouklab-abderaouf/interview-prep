"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DrillButtonProps {
  stageId: string;
  questionIndex: number;
  label?: string;
  className?: string;
  isLocked?: boolean;
}

export function DrillButton({
  stageId,
  questionIndex,
  label = "⚡ Drill Question (2m)",
  className = "",
  isLocked = false,
}: DrillButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "starting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClick = async () => {
    if (isLocked) return;
    setStatus("starting");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId, drill: true, questionIndex }),
      });
      const body = (await res.json().catch(() => ({}))) as { sessionId?: string; error?: string };
      if (!res.ok || !body.sessionId) {
        throw new Error(body.error ?? `Failed to start drill (${res.status})`);
      }
      router.push(`/session/${body.sessionId}?stageId=${stageId}&drill=true&qIndex=${questionIndex}`);
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
        disabled={status === "starting" || isLocked}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 shadow-sm transition-all hover:border-amber-500/60 hover:bg-amber-500/20 active:scale-95 disabled:opacity-40 ${className}`}
      >
        {status === "starting" ? (
          <>
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            <span>Launching Drill...</span>
          </>
        ) : (
          label
        )}
      </button>
      {errorMessage && <p className="text-[11px] text-red-500">{errorMessage}</p>}
    </div>
  );
}

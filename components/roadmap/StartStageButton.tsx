"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface StartStageButtonProps {
  stageId: string;
  /** Defaults to "Start"; the scorecard reuses this as a retry action. */
  label?: string;
}

// specs §8.1 — the skill tree's "Start" action: opens the interview room.
// The session row is created by the room when the call actually starts —
// creating it here left an empty "active" session behind every time someone
// opened the room and changed their mind (production readiness phase 6).
export function StartStageButton({ stageId, label = "Start" }: StartStageButtonProps) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  const handleClick = () => {
    setOpening(true);
    router.push(`/session/new?stageId=${encodeURIComponent(stageId)}`);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={opening}
        className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {opening ? "Opening…" : label}
      </button>
    </div>
  );
}

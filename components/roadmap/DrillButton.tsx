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
  const [opening, setOpening] = useState(false);

  // Opens the room; the drill's session row is created there, on Start —
  // see StartStageButton.
  const handleClick = () => {
    if (isLocked) return;
    setOpening(true);
    router.push(`/session/new?stageId=${encodeURIComponent(stageId)}&drill=true&qIndex=${questionIndex}`);
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={opening || isLocked}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 shadow-sm transition-all hover:border-amber-500/60 hover:bg-amber-500/20 active:scale-95 disabled:opacity-40 ${className}`}
      >
        {opening ? (
          <>
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            <span>Launching Drill...</span>
          </>
        ) : (
          label
        )}
      </button>
    </div>
  );
}

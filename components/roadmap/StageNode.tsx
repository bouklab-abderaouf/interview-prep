"use client";

import { motion, useReducedMotion } from "motion/react";

import type { StageState } from "./types";

interface StageNodeProps {
  index: number;
  title: string;
  state: StageState;
  stars: number;
  selected: boolean;
  onSelect: () => void;
}

const STATE_STYLES: Record<StageState, string> = {
  locked: "border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-600",
  available: "border-blue-500 bg-blue-500 text-white shadow-lg shadow-blue-500/30",
  attempted: "border-amber-500 bg-amber-400 text-amber-950",
};

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

// specs §8.1 — locked (grey, lock icon), available (pulsing), completed
// (stars filled).
export function StageNode({ index, title, state, stars, selected, onSelect }: StageNodeProps) {
  const reduceMotion = useReducedMotion();
  const locked = state === "locked";
  const shouldPulse = state === "available" && !reduceMotion;

  return (
    <div className="flex w-32 flex-col items-center gap-2">
      <motion.button
        type="button"
        onClick={onSelect}
        disabled={locked}
        aria-label={`Stage ${index + 1}: ${title} (${state})`}
        aria-pressed={selected}
        className={`flex h-16 w-16 items-center justify-center rounded-full border-2 text-lg font-semibold ${STATE_STYLES[state]} ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}
        animate={shouldPulse ? { scale: [1, 1.07, 1] } : { scale: 1 }}
        transition={
          shouldPulse
            ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
            : { type: "spring", stiffness: 300, damping: 20 }
        }
        whileHover={locked ? undefined : { scale: 1.08 }}
        whileTap={locked ? undefined : { scale: 0.94 }}
      >
        {locked ? <LockIcon /> : index + 1}
      </motion.button>

      <p className="text-center text-xs leading-tight font-medium">{title}</p>

      {state === "attempted" && (
        <p className="text-sm text-amber-500" aria-label={`${stars} of 3 stars`}>
          {"★".repeat(stars)}
          <span className="text-zinc-300 dark:text-zinc-700">{"★".repeat(3 - stars)}</span>
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

interface SessionTimerProps {
  isActive: boolean;
  startTime?: number | null;
  className?: string;
}

export function SessionTimer({ isActive, startTime, className = "" }: SessionTimerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const start = startTime ?? Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      setElapsedSeconds(Math.max(0, Math.floor((now - start) / 1000)));
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, startTime]);

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className={`flex items-center gap-2 font-mono text-xs tabular-nums text-zinc-300 ${className}`}>
      {isActive && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
      <span>{formatted}</span>
    </div>
  );
}

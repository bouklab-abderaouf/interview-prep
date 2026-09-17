"use client";

import { useEffect, useRef } from "react";

export interface TranscriptEntry {
  role: "candidate" | "interviewer";
  text: string;
}

interface TranscriptFeedProps {
  entries: TranscriptEntry[];
  interviewerName?: string;
  className?: string;
}

export function TranscriptFeed({
  entries,
  interviewerName = "Interviewer",
  className = "",
}: TranscriptFeedProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 text-center text-xs text-zinc-500 ${className}`}>
        Live transcription will appear here as you speak.
      </div>
    );
  }

  return (
    <div ref={scrollRef} className={`flex flex-col gap-3 overflow-y-auto p-4 ${className}`}>
      {entries.map((entry, index) => {
        const isCandidate = entry.role === "candidate";
        return (
          <div
            key={index}
            className={`flex flex-col gap-1 text-xs ${
              isCandidate ? "items-end text-right" : "items-start text-left"
            }`}
          >
            <span className="text-[10px] font-medium text-zinc-400">
              {isCandidate ? "You" : interviewerName}
            </span>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 leading-relaxed ${
                isCandidate
                  ? "bg-blue-600 text-white dark:bg-blue-500 dark:text-zinc-950"
                  : "bg-zinc-800 text-zinc-200 border border-zinc-700/60"
              }`}
            >
              {entry.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}

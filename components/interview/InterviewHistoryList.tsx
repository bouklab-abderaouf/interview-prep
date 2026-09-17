"use client";

import { useState } from "react";
import Link from "next/link";

import { formatDateTime, formatDuration } from "@/lib/format";
import { ScoreSessionButton } from "@/components/interview/ScoreSessionButton";

export interface InterviewHistoryItem {
  id: string;
  stageTitle: string;
  roadmapContext?: string;
  startedAt: string;
  durationSeconds: number | null;
  turns: number;
  language: string;
  status: string;
  scorecard?: {
    overall: number;
    stars: number;
    xp_awarded: number;
  } | null;
  unscoredButRecoverable: boolean;
}

interface InterviewHistoryListProps {
  items: InterviewHistoryItem[];
}

type FilterTab = "all" | "scored" | "needs_scoring";

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  abandoned: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  errored: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  active: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};

export function InterviewHistoryList({ items }: InterviewHistoryListProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const scoredCount = items.filter((i) => !!i.scorecard).length;
  const needsScoringCount = items.filter((i) => i.unscoredButRecoverable).length;

  const filteredItems = items.filter((item) => {
    if (activeTab === "scored") return !!item.scorecard;
    if (activeTab === "needs_scoring") return item.unscoredButRecoverable;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            activeTab === "all"
              ? "bg-black text-white dark:bg-white dark:text-black"
              : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          All ({items.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("scored")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            activeTab === "scored"
              ? "bg-black text-white dark:bg-white dark:text-black"
              : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          Scored ({scoredCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("needs_scoring")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            activeTab === "needs_scoring"
              ? "bg-amber-600 text-white dark:bg-amber-500 dark:text-black"
              : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          Needs scoring ({needsScoringCount})
        </button>
      </div>

      {filteredItems.length > 0 ? (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {filteredItems.map((item) => {
            const body = (
              <div className="flex items-center justify-between gap-4 py-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.stageTitle}</span>
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 uppercase dark:bg-zinc-800 dark:text-zinc-400">
                      {item.language}
                    </span>
                  </div>
                  <span className="text-sm text-zinc-500">
                    {item.roadmapContext ? `${item.roadmapContext} · ` : ""}
                    {formatDateTime(item.startedAt)}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {formatDuration(item.durationSeconds)} &middot; {item.turns} turn
                    {item.turns === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {item.scorecard ? (
                    <>
                      <span
                        className="text-sm text-amber-500"
                        aria-label={`${item.scorecard.stars} of 3 stars`}
                      >
                        {"★".repeat(item.scorecard.stars)}
                        <span className="text-zinc-300 dark:text-zinc-700">
                          {"★".repeat(3 - item.scorecard.stars)}
                        </span>
                      </span>
                      <div className="flex flex-col items-end">
                        <span className="text-lg font-medium tabular-nums">
                          {item.scorecard.overall}
                          <span className="text-xs text-zinc-400">/100</span>
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          +{item.scorecard.xp_awarded} XP
                        </span>
                      </div>
                    </>
                  ) : item.unscoredButRecoverable ? (
                    <ScoreSessionButton sessionId={item.id} label="Score it" />
                  ) : (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs capitalize ${
                        STATUS_STYLES[item.status] ?? STATUS_STYLES.abandoned
                      }`}
                    >
                      {item.status}
                    </span>
                  )}
                </div>
              </div>
            );

            return (
              <li key={item.id}>
                {item.scorecard ? (
                  <Link href={`/scorecard/${item.id}`} className="block hover:opacity-75 transition-opacity">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="py-8 text-center text-sm text-zinc-500">
          {activeTab === "scored"
            ? "No scored interviews yet."
            : activeTab === "needs_scoring"
            ? "No unscored interviews waiting. All eligible sessions are scored!"
            : "No interviews found."}
        </div>
      )}
    </div>
  );
}

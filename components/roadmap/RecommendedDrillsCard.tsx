"use client";

import { useState } from "react";
import { DrillButton } from "@/components/roadmap/DrillButton";
import type { RoadmapStage } from "@/components/roadmap/types";

interface RecommendedDrillsCardProps {
  stages: RoadmapStage[];
  gaps?: Array<{
    requirement: string;
    severity: "blocking" | "significant" | "minor";
    mitigation_angle: string;
  }>;
  riskQuestions?: string[];
  unlockedStageIds: Set<string>;
}

export function RecommendedDrillsCard({
  stages,
  gaps = [],
  riskQuestions = [],
  unlockedStageIds,
}: RecommendedDrillsCardProps) {
  const [activeTab, setActiveTab] = useState<"gaps" | "questions">("gaps");

  // Find questions across all unlocked stages that probe these gaps
  const drills: Array<{
    stageId: string;
    stageTitle: string;
    questionIndex: number;
    questionText: string;
    targets: string;
    isLocked: boolean;
  }> = [];

  stages.forEach((stage) => {
    const isLocked = !unlockedStageIds.has(stage.id);
    if (stage.question_bank && Array.isArray(stage.question_bank)) {
      stage.question_bank.forEach((q, idx) => {
        drills.push({
          stageId: stage.id,
          stageTitle: stage.title,
          questionIndex: idx,
          questionText: q.text,
          targets: q.targets,
          isLocked,
        });
      });
    }
  });

  if (drills.length === 0 && gaps.length === 0 && riskQuestions.length === 0) {
    return null;
  }

  const severityColor: Record<string, string> = {
    blocking: "bg-red-500/10 text-red-400 border-red-500/20",
    significant: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    minor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-6 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            <span>⚡ Recommended Question Drills</span>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500 dark:text-amber-400">
              2-min practice
            </span>
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Target uncomfortable CV gaps and high-stakes questions in quick audio drills before your full stage interviews.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab("gaps")}
            className={`rounded-md px-3 py-1 font-medium transition-all ${
              activeTab === "gaps"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            CV Gaps ({gaps.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("questions")}
            className={`rounded-md px-3 py-1 font-medium transition-all ${
              activeTab === "questions"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Quick Bank ({drills.length})
          </button>
        </div>
      </div>

      {activeTab === "gaps" && (
        <div className="flex flex-col gap-3">
          {gaps.length === 0 ? (
            <p className="text-xs text-zinc-500">No major CV gaps identified for this role.</p>
          ) : (
            gaps.map((gap, index) => {
              // Find matching drill question if any
              const matchingDrill = drills.find((d) =>
                d.targets.toLowerCase().includes(gap.requirement.toLowerCase().slice(0, 15)) ||
                d.questionText.toLowerCase().includes(gap.requirement.toLowerCase().slice(0, 15))
              ) ?? drills[0];

              return (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-all hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                >
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          severityColor[gap.severity] ?? severityColor.minor
                        }`}
                      >
                        {gap.severity}
                      </span>
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {gap.requirement}
                      </span>
                    </div>
                    {gap.mitigation_angle && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        <strong className="font-medium text-zinc-600 dark:text-zinc-300">Angle:</strong> {gap.mitigation_angle}
                      </p>
                    )}
                  </div>

                  {matchingDrill && (
                    <div className="sm:self-center">
                      <DrillButton
                        stageId={matchingDrill.stageId}
                        questionIndex={matchingDrill.questionIndex}
                        label="⚡ Drill Question"
                        isLocked={matchingDrill.isLocked}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === "questions" && (
        <div className="flex flex-col gap-2.5 max-h-96 overflow-y-auto pr-1">
          {drills.map((drill, index) => (
            <div
              key={index}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-zinc-200/80 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-[10px] font-semibold tracking-wide uppercase text-zinc-400">
                  {drill.stageTitle}
                </span>
                <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  {drill.questionText}
                </p>
                <p className="text-[11px] text-zinc-500">
                  <span className="text-zinc-400">Probing:</span> {drill.targets}
                </p>
              </div>

              <div className="sm:self-center">
                <DrillButton
                  stageId={drill.stageId}
                  questionIndex={drill.questionIndex}
                  label="⚡ Drill (2m)"
                  isLocked={drill.isLocked}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

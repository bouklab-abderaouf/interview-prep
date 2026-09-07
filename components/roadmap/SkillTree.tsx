"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { StageNode } from "./StageNode";
import { StartStageButton } from "./StartStageButton";
import { stageStateFor, type RoadmapStage, type StageProgress } from "./types";

interface SkillTreeProps {
  stages: RoadmapStage[];
  progressByStageId: Record<string, StageProgress>;
}

// Fixed layout rather than measuring the DOM: with a known node count and
// spacing the serpentine coordinates are deterministic, so the connecting
// path can be drawn without refs, layout effects, or a resize observer.
const NODE_X = [90, 230];
const FIRST_Y = 60;
const SPACING_Y = 130;
const VIEW_W = 320;
const CIRCLE_RADIUS = 32;

// specs §8.1 — vertical serpentine path, four stage nodes, Framer Motion
// (published as `motion` now). Tap a node → sheet with description, focus
// areas, best score, Start.
export function SkillTree({ stages, progressByStageId }: SkillTreeProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const reduceMotion = !!useReducedMotion();
  // Starts undrawn so the CSS transition has something to animate from on
  // mount; reduced-motion users get it drawn immediately.
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const points = stages.map((_, i) => ({ x: NODE_X[i % 2], y: FIRST_Y + i * SPACING_Y }));
  const viewH = FIRST_Y + Math.max(0, stages.length - 1) * SPACING_Y + 100;

  const pathD = points.reduce((acc, point, i) => {
    if (i === 0) return `M ${point.x} ${point.y}`;
    const prev = points[i - 1];
    const curve = SPACING_Y / 2;
    return `${acc} C ${prev.x} ${prev.y + curve}, ${point.x} ${point.y - curve}, ${point.x} ${point.y}`;
  }, "");

  const unlockedCount = stages.filter((s) => progressByStageId[s.id]?.unlocked).length;
  const progressFraction =
    stages.length > 1 ? Math.min(1, Math.max(0, (unlockedCount - 1) / (stages.length - 1))) : 0;

  const selected = stages.find((s) => s.id === selectedId) ?? null;
  const selectedProgress = selected ? progressByStageId[selected.id] : undefined;

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  return (
    <>
      <div className="relative mx-auto text-zinc-900 dark:text-zinc-100" style={{ width: VIEW_W, height: viewH }}>
        <svg
          className="absolute inset-0"
          width={VIEW_W}
          height={viewH}
          viewBox={`0 0 ${VIEW_W} ${viewH}`}
          aria-hidden
        >
          <path
            d={pathD}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray="2 14"
          />
          {/* Plain <path>, not motion.path. pathLength={1} normalizes the
              path to one unit, so dasharray "1 1" with dashoffset
              (1 - fraction) draws exactly that fraction from the start —
              no DOM measuring. Motion drives everything else here, but it
              owns strokeDasharray/strokeDashoffset internally (it derives
              them from its own pathLength handling), so animating them
              through it fights that machinery: verified in the browser,
              its `pathLength` settled at 0.033 for a 0.333 target and a
              direct strokeDashoffset animation never left its initial
              value. A CSS transition off a mount flag is boring and works. */}
          <path
            d={pathD}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={6}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={drawn ? 1 - progressFraction : 1}
            style={reduceMotion ? undefined : { transition: "stroke-dashoffset 1s ease-out" }}
          />
        </svg>

        {stages.map((stage, i) => (
          <div
            key={stage.id}
            className="absolute -translate-x-1/2"
            style={{ left: points[i].x, top: points[i].y - CIRCLE_RADIUS }}
          >
            <StageNode
              index={i}
              title={stage.title}
              state={stageStateFor(progressByStageId[stage.id])}
              stars={progressByStageId[stage.id]?.stars ?? 0}
              selected={selectedId === stage.id}
              onSelect={() => setSelectedId(stage.id)}
            />
          </div>
        ))}
      </div>

      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setSelectedId(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              key="sheet"
              role="dialog"
              aria-modal="true"
              aria-label={selected.title}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-lg flex-col gap-4 rounded-t-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
              initial={reduceMotion ? false : { y: "100%" }}
              animate={{ y: 0 }}
              exit={reduceMotion ? undefined : { y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-medium">{selected.title}</h2>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="text-sm text-zinc-500 underline"
                >
                  Close
                </button>
              </div>

              {selected.description && (
                <p className="text-sm text-zinc-500">{selected.description}</p>
              )}

              {selected.focus_areas.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {selected.focus_areas.map((area) => (
                    <li
                      key={area}
                      className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                    >
                      {area}
                    </li>
                  ))}
                </ul>
              )}

              <dl className="flex gap-6 text-sm">
                <div>
                  <dt className="text-xs text-zinc-500">Best score</dt>
                  <dd className="font-medium tabular-nums">
                    {selectedProgress?.best_score ?? "—"}
                    <span className="text-xs font-normal text-zinc-500"> / pass {selected.pass_score}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Attempts</dt>
                  <dd className="font-medium tabular-nums">{selectedProgress?.attempts ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Stars</dt>
                  <dd className="font-medium text-amber-500">
                    {"★".repeat(selectedProgress?.stars ?? 0) || "—"}
                  </dd>
                </div>
              </dl>

              {selectedProgress?.unlocked ? (
                <StartStageButton stageId={selected.id} />
              ) : (
                <p className="text-sm text-zinc-500">
                  Locked — score at least {selected.pass_score} on the previous stage to unlock this one.
                </p>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

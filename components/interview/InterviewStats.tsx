import type { ReactNode } from "react";

import { formatInstant } from "@/lib/format";
import type { InterviewStats as Stats } from "@/lib/interviews";

// KPI row at the top of /interviews: is practice actually moving the score?
// Score numbers cover full interviews only — a drill grades one question, so
// mixing them in would make the trend jump for reasons that aren't progress.
export function InterviewStats({ stats }: { stats: Stats }) {
  const delta = stats.latest !== null && stats.previous !== null ? stats.latest - stats.previous : null;

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile
        label="Scored"
        value={String(stats.scored)}
        footnote={stats.drillsScored ? `incl. ${stats.drillsScored} drill${stats.drillsScored === 1 ? "" : "s"}` : "interviews"}
      />
      <Tile
        label="Latest score"
        value={stats.latest === null ? "—" : String(stats.latest)}
        unit={stats.latest === null ? undefined : "/100"}
        footnote={delta === null ? "full interviews" : <Delta value={delta} />}
        trend={stats.trend.length >= 2 ? <Sparkline points={stats.trend} /> : null}
      />
      <Tile
        label="Best score"
        value={stats.best === null ? "—" : String(stats.best)}
        unit={stats.best === null ? undefined : "/100"}
        footnote="full interviews"
      />
      <Tile
        label="Time practised"
        value={stats.practisedSeconds ? formatPracticeTime(stats.practisedSeconds) : "—"}
        footnote="speaking with an interviewer"
      />
    </dl>
  );
}

function Tile({
  label,
  value,
  unit,
  footnote,
  trend,
}: {
  label: string;
  value: string;
  unit?: string;
  footnote: ReactNode;
  trend?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold tracking-tight">
          {value}
          {unit && <span className="ml-0.5 text-sm font-normal text-zinc-400 dark:text-zinc-500">{unit}</span>}
        </span>
        {trend}
      </dd>
      <dd className="text-xs text-zinc-500 dark:text-zinc-400">{footnote}</dd>
    </div>
  );
}

// Direction carries meaning here (up is good), so the arrow says it as well
// as the colour.
function Delta({ value }: { value: number }) {
  if (value === 0) return <span>No change vs previous</span>;
  const up = value > 0;
  return (
    <span className={up ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>
      <span aria-hidden>{up ? "▲" : "▼"}</span> {Math.abs(value)} <span className="text-zinc-500 dark:text-zinc-400">vs previous</span>
      <span className="sr-only">{up ? "points higher" : "points lower"}</span>
    </span>
  );
}

// A headline total: seconds are noise at this size ("45m", not "45m 11s").
function formatPracticeTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const W = 88;
const H = 32;
const PAD = 4;

// Fixed 0–100 scale: a score that moved 28 → 65 should look like a big jump,
// and one that moved 61 → 65 shouldn't. Past points in the de-emphasis grey,
// the latest in the accent; each point's date and score on hover.
function Sparkline({ points }: { points: Array<{ overall: number; startedAt: string }> }) {
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (points.length - 1);
  const y = (score: number) => H - PAD - (score / 100) * (H - 2 * PAD);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.overall).toFixed(1)}`).join(" ");
  const last = points.length - 1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`Score trend: ${points.map((p) => p.overall).join(", ")}`}
      className="shrink-0 overflow-visible"
    >
      <path d={path} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-zinc-300 dark:stroke-zinc-600" />
      {points.map((p, i) => (
        <g key={p.startedAt}>
          <circle
            cx={x(i)}
            cy={y(p.overall)}
            r={i === last ? 4 : 2}
            className={i === last ? "fill-blue-600 dark:fill-blue-400" : "fill-zinc-400 dark:fill-zinc-500"}
          />
          {/* Hit target bigger than the mark. */}
          <circle cx={x(i)} cy={y(p.overall)} r={8} fill="transparent">
            <title>{`${p.overall}/100 · ${formatInstant(p.startedAt, "date", "UTC")}`}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}

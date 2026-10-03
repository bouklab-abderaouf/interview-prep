// What /interviews shows about each session, derived from the raw rows. Pure
// (the clock and time zone are parameters) so the labels, grouping and
// summary numbers can be tested without a database or a browser.

export interface InterviewSummary {
  id: string;
  stageTitle: string;
  roadmapId?: string;
  roadmapContext?: string;
  startedAt: string;
  durationSeconds: number | null;
  turns: number;
  language: string;
  status: string;
  drill: boolean;
  targetQuestion?: string;
  /** false once the stage is gone — such a session can't be scored */
  hasStage: boolean;
  scorecard: { overall: number; stars: number; xp_awarded: number } | null;
}

export type InterviewState = "scored" | "needs_scoring" | "in_progress" | "not_started" | "unscorable";

// A session row is created when the interview room opens, not when the call
// starts, so leaving the room without pressing Start leaves an "active" row
// behind forever — 5 of one account's first 14 sessions. Status alone can't
// tell those apart from a call happening right now; age can.
export const IN_PROGRESS_WINDOW_MS = 30 * 60 * 1000;

export function interviewState(item: InterviewSummary, now: number): InterviewState {
  if (item.scorecard) return "scored";
  if (item.turns > 0) return item.hasStage ? "needs_scoring" : "unscorable";
  if (item.status === "active" && now - Date.parse(item.startedAt) < IN_PROGRESS_WINDOW_MS) {
    return "in_progress";
  }
  return "not_started";
}

export interface InterviewStats {
  scored: number;
  drillsScored: number;
  /** Full interviews only: a drill scores one question, not an interview. */
  latest: number | null;
  previous: number | null;
  best: number | null;
  /** Oldest → newest, at most 12 points, full interviews only. */
  trend: Array<{ overall: number; startedAt: string }>;
  practisedSeconds: number;
}

export function interviewStats(items: InterviewSummary[]): InterviewStats {
  const scored = items.filter((i) => i.scorecard);
  const full = scored
    .filter((i) => !i.drill)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .map((i) => ({ overall: i.scorecard!.overall, startedAt: i.startedAt }));
  const fullScores = full.map((p) => p.overall);

  return {
    scored: scored.length,
    drillsScored: scored.filter((i) => i.drill).length,
    latest: fullScores.at(-1) ?? null,
    previous: fullScores.at(-2) ?? null,
    best: fullScores.length ? Math.max(...fullScores) : null,
    trend: full.slice(-12),
    practisedSeconds: items
      .filter((i) => i.turns > 0)
      .reduce((sum, i) => sum + (i.durationSeconds ?? 0), 0),
  };
}

/** YYYY-MM-DD of `iso` in `timeZone` (undefined = the runtime's own). */
export function dayKey(iso: string, timeZone?: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}

export interface DayGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/** Newest day first; items keep their incoming order within a day. */
export function groupByDay<T extends { startedAt: string }>(
  items: T[],
  { now, timeZone }: { now: number; timeZone?: string },
): DayGroup<T>[] {
  const today = dayKey(new Date(now).toISOString(), timeZone);
  const yesterday = dayKey(new Date(now - 24 * 60 * 60 * 1000).toISOString(), timeZone);
  const labelFormat = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });

  const groups = new Map<string, DayGroup<T>>();
  for (const item of items) {
    const key = dayKey(item.startedAt, timeZone);
    let group = groups.get(key);
    if (!group) {
      const label =
        key === today ? "Today" : key === yesterday ? "Yesterday" : labelFormat.format(new Date(item.startedAt));
      group = { key, label, items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

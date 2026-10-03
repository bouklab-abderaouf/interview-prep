"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { InterviewStats } from "@/components/interview/InterviewStats";
import { ScoreSessionButton } from "@/components/interview/ScoreSessionButton";
import { formatDuration, formatInstant } from "@/lib/format";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import {
  groupByDay,
  interviewState,
  interviewStats,
  type InterviewState,
  type InterviewSummary,
} from "@/lib/interviews";
import { scoreStatus } from "@/lib/metrics/assessment";

type Filter = "all" | "scored" | "needs_scoring" | "not_started";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "scored", label: "Scored" },
  { id: "needs_scoring", label: "Needs scoring" },
  { id: "not_started", label: "Not started" },
];

type Row = InterviewSummary & { state: InterviewState };

// /interviews. It used to be one flat list where 8 of 14 rows were sessions
// nobody ever spoke in, labelled "Active" for weeks, with times in UTC and
// no way to remove anything. Now: a progress summary, filters, rows grouped
// by the viewer's own day, honest states, and delete (one, or every
// not-started session at once).
export function InterviewHistoryList({ items, now }: { items: InterviewSummary[]; now: number }) {
  const router = useRouter();
  const hydrated = useHydrated();
  // UTC until hydrated so server and client agree, then the viewer's zone.
  const timeZone = hydrated ? undefined : "UTC";

  const [filter, setFilter] = useState<Filter>("all");
  const [roadmapId, setRoadmapId] = useState<string>("all");
  // Hidden as soon as a delete succeeds; router.refresh() then brings the
  // server's copy in line.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());

  const remove = (ids: string[]) => {
    setRemoved((previous) => new Set([...previous, ...ids]));
    router.refresh();
  };

  const roadmaps = [
    ...new Map(
      items.filter((i) => i.roadmapId).map((i) => [i.roadmapId!, i.roadmapContext ?? "Roadmap"]),
    ).entries(),
  ];

  const rows: Row[] = items
    .filter((i) => !removed.has(i.id))
    .filter((i) => roadmapId === "all" || i.roadmapId === roadmapId)
    .map((i) => ({ ...i, state: interviewState(i, now) }));

  const counts: Record<Filter, number> = {
    all: rows.length,
    scored: rows.filter((r) => r.state === "scored").length,
    needs_scoring: rows.filter((r) => r.state === "needs_scoring").length,
    not_started: rows.filter((r) => r.state === "not_started").length,
  };
  const shown = filter === "all" ? rows : rows.filter((r) => r.state === filter);
  const notStartedIds = rows.filter((r) => r.state === "not_started").map((r) => r.id);

  return (
    <div className="flex flex-col gap-8">
      <InterviewStats stats={interviewStats(rows)} />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="Filter interviews"
            className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-1 [scrollbar-width:none] dark:bg-zinc-900"
          >
            {FILTERS.map(({ id, label }) => {
              if (id !== "all" && counts[id] === 0 && filter !== id) return null;
              const active = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  aria-pressed={active}
                  className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-white font-medium text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  {label}
                  <span
                    className={`rounded-full px-1.5 text-xs tabular-nums ${
                      id === "needs_scoring" && counts[id] > 0
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {counts[id]}
                  </span>
                </button>
              );
            })}
          </div>

          {roadmaps.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="sr-only">Roadmap</span>
              <select
                value={roadmapId}
                onChange={(event) => setRoadmapId(event.target.value)}
                className="h-9 max-w-44 truncate rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="all">All roadmaps</option>
                {roadmaps.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {notStartedIds.length > 0 && (
            <ClearNotStartedButton ids={notStartedIds} onCleared={remove} />
          )}
        </div>

        {shown.length > 0 ? (
          <div className="flex flex-col gap-6">
            {groupByDay(shown, { now, timeZone }).map((group) => (
              <section key={group.key} aria-labelledby={`day-${group.key}`} className="flex flex-col gap-1">
                <h2
                  id={`day-${group.key}`}
                  className="px-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  {group.label}
                </h2>
                <ul className="flex flex-col">
                  {group.items.map((row) => (
                    <InterviewRow key={row.id} row={row} timeZone={timeZone} onDeleted={() => remove([row.id])} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            {filter === "scored"
              ? "No scored interviews yet."
              : filter === "needs_scoring"
                ? "Nothing waiting to be scored."
                : filter === "not_started"
                  ? "No empty sessions."
                  : "No interviews here yet."}
          </p>
        )}
      </div>
    </div>
  );
}

function InterviewRow({
  row,
  timeZone,
  onDeleted,
}: {
  row: Row;
  timeZone: string | undefined;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  const time = formatInstant(row.startedAt, "time", timeZone);
  const href = row.state === "scored" ? `/scorecard/${row.id}` : undefined;
  const subtitle = row.drill ? row.targetQuestion : row.roadmapContext;

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${row.id}`, { method: "DELETE" });
      // Already gone counts as done.
      if (!res.ok && res.status !== 404) throw new Error(`Couldn't delete (error ${res.status}). Try again.`);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  };

  return (
    <li
      className="group relative rounded-xl transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
      onKeyDown={(event) => {
        if (event.key === "Escape" && confirming && !deleting) setConfirming(false);
      }}
    >
      {/* Stretched link: the whole row opens the scorecard, without nesting
          the row's own buttons inside an <a>. */}
      {href && (
        <Link
          href={href}
          aria-label={`Open scorecard: ${row.stageTitle}, ${time}`}
          className="absolute inset-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        />
      )}

      <div className="flex items-center gap-4 px-3 py-3">
        <StateBadge row={row} />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate font-medium">{row.stageTitle}</p>
            {row.drill && (
              <span className="shrink-0 rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-500/15 dark:text-violet-300">
                Drill
              </span>
            )}
            <span className="shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {row.language}
            </span>
          </div>
          {subtitle && <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
          <p className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
            <time dateTime={row.startedAt}>{time}</time>
            {row.turns > 0 ? (
              <>
                {" · "}
                {formatDuration(row.durationSeconds)} · {row.turns} turn{row.turns === 1 ? "" : "s"}
              </>
            ) : (
              " · Nothing recorded"
            )}
          </p>
        </div>

        <div className="relative z-10 flex shrink-0 items-center gap-1 sm:gap-3">
          <RowStatus row={row} />
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete interview: ${row.stageTitle}, ${time}`}
            title="Delete"
            disabled={confirming}
            className="rounded-md p-2 text-zinc-400 opacity-100 transition hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 disabled:opacity-0 sm:opacity-0 sm:group-hover:opacity-100 dark:hover:bg-red-950/40 dark:hover:text-red-400 [@media(hover:none)]:opacity-100"
          >
            <TrashIcon />
          </button>
          {href && (
            <span aria-hidden className="hidden text-zinc-400 sm:inline">
              <ChevronIcon />
            </span>
          )}
        </div>
      </div>

      {confirming && (
        <div
          role="alertdialog"
          aria-label="Confirm delete"
          className="relative z-10 mx-3 mb-3 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm sm:flex-row sm:items-center dark:border-red-900/60 dark:bg-red-950/30"
        >
          <p className="flex-1 text-red-900 dark:text-red-200">
            {row.state === "scored"
              ? "Delete this interview and its scorecard? XP and stage progress you've earned stay."
              : "Delete this session?"}
            {error && <span className="mt-1 block text-red-700 dark:text-red-400">{error}</span>}
          </p>
          <div className="flex gap-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

const SCORE_BADGE = {
  good: "border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  watch: "border-amber-500/40 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300",
  fix: "border-red-600/30 bg-red-50 text-red-800 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-300",
};

function StateBadge({ row }: { row: Row }) {
  const base = "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-sm font-semibold tabular-nums";
  switch (row.state) {
    case "scored":
      return (
        <span className={`${base} ${SCORE_BADGE[scoreStatus(row.scorecard!.overall)]}`} aria-label={`Score ${row.scorecard!.overall} out of 100`}>
          {row.scorecard!.overall}
        </span>
      );
    case "needs_scoring":
      return (
        <span className={`${base} border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300`} aria-hidden>
          !
        </span>
      );
    case "in_progress":
      return (
        <span className={`${base} border-blue-600/30 bg-blue-50 dark:bg-blue-500/10`} aria-hidden>
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-600 dark:bg-blue-400" />
        </span>
      );
    default:
      return (
        <span className={`${base} border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500`} aria-hidden>
          –
        </span>
      );
  }
}

function RowStatus({ row }: { row: Row }) {
  switch (row.state) {
    case "scored":
      return (
        <div className="hidden flex-col items-end sm:flex">
          <span className="text-sm tracking-wider" aria-label={`${row.scorecard!.stars} of 3 stars`}>
            <span className="text-amber-500">{"★".repeat(row.scorecard!.stars)}</span>
            <span className="text-zinc-300 dark:text-zinc-700">{"★".repeat(3 - row.scorecard!.stars)}</span>
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">+{row.scorecard!.xp_awarded} XP</span>
        </div>
      );
    case "needs_scoring":
      return <ScoreSessionButton sessionId={row.id} label="Score it" size="sm" />;
    case "in_progress":
      return <span className="hidden text-xs font-medium text-blue-700 sm:inline dark:text-blue-300">In progress</span>;
    case "unscorable":
      return <span className="text-xs text-zinc-500 dark:text-zinc-400">Can&apos;t be scored</span>;
    default:
      return <span className="hidden text-xs text-zinc-500 sm:inline dark:text-zinc-400">Not started</span>;
  }
}

function ClearNotStartedButton({ ids, onCleared }: { ids: string[]; onCleared: (ids: string[]) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClear = async () => {
    setClearing(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(`Couldn't clear them (error ${res.status}).`);
      onCleared(ids);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setClearing(false);
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="ml-auto flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
      >
        <TrashIcon />
        Clear {ids.length} not started
      </button>
    );
  }

  return (
    <div role="alertdialog" aria-label="Confirm clearing" className="ml-auto flex flex-wrap items-center gap-2 text-sm">
      <span className="text-zinc-600 dark:text-zinc-300">
        Delete {ids.length} session{ids.length === 1 ? "" : "s"} with nothing recorded?
      </span>
      {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={clearing}
        className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleClear}
        disabled={clearing}
        className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:opacity-60"
      >
        {clearing ? "Clearing…" : "Clear"}
      </button>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <path d="M3.5 5.5h13M8 5.5V4a1 1 0 011-1h2a1 1 0 011 1v1.5M5 5.5l.8 10.1a1.5 1.5 0 001.5 1.4h5.4a1.5 1.5 0 001.5-1.4L15 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path d="M8 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

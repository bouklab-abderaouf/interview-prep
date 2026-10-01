import { describe, expect, it } from "vitest";

import {
  dayKey,
  groupByDay,
  IN_PROGRESS_WINDOW_MS,
  interviewState,
  interviewStats,
  type InterviewSummary,
} from "@/lib/interviews";

const NOW = Date.parse("2026-10-01T18:40:00Z");

function item(overrides: Partial<InterviewSummary> = {}): InterviewSummary {
  return {
    id: "s1",
    stageTitle: "Stage",
    startedAt: "2026-10-01T11:25:00Z",
    durationSeconds: 400,
    turns: 30,
    language: "fr",
    status: "completed",
    drill: false,
    hasStage: true,
    scorecard: null,
    ...overrides,
  };
}

describe("interviewState", () => {
  it("is scored whenever a scorecard exists, whatever the status says", () => {
    expect(interviewState(item({ status: "active", scorecard: { overall: 50, stars: 0, xp_awarded: 80 } }), NOW)).toBe(
      "scored",
    );
  });

  it("needs scoring when answers were captured but never scored", () => {
    expect(interviewState(item({ status: "abandoned" }), NOW)).toBe("needs_scoring");
  });

  it("can't be scored once its stage is gone", () => {
    expect(interviewState(item({ hasStage: false }), NOW)).toBe("unscorable");
  });

  it("is in progress only while a fresh active session has no answers yet", () => {
    const fresh = new Date(NOW - 5 * 60 * 1000).toISOString();
    expect(interviewState(item({ status: "active", turns: 0, startedAt: fresh }), NOW)).toBe("in_progress");
  });

  it("treats an old active session with no answers as never started (the room was left idle)", () => {
    const stale = new Date(NOW - IN_PROGRESS_WINDOW_MS - 1).toISOString();
    expect(interviewState(item({ status: "active", turns: 0, startedAt: stale }), NOW)).toBe("not_started");
  });

  it("treats an abandoned session with no answers as never started", () => {
    expect(interviewState(item({ status: "abandoned", turns: 0 }), NOW)).toBe("not_started");
  });
});

describe("interviewStats", () => {
  const scored = (startedAt: string, overall: number, drill = false) =>
    item({ startedAt, drill, scorecard: { overall, stars: 0, xp_awarded: 0 } });

  it("reports latest, previous and best over full interviews in chronological order", () => {
    const stats = interviewStats([
      scored("2026-10-01T11:25:00Z", 65),
      scored("2026-09-08T20:26:00Z", 28),
      scored("2026-09-30T20:05:00Z", 54),
    ]);
    expect(stats).toMatchObject({ scored: 3, latest: 65, previous: 54, best: 65 });
    expect(stats.trend.map((p) => p.overall)).toEqual([28, 54, 65]);
  });

  it("counts drills as scored but keeps them out of the interview trend", () => {
    const stats = interviewStats([scored("2026-09-01T10:00:00Z", 40), scored("2026-09-02T10:00:00Z", 95, true)]);
    expect(stats).toMatchObject({ scored: 2, drillsScored: 1, latest: 40, best: 40, previous: null });
  });

  it("keeps only the last 12 points of the trend", () => {
    const items = Array.from({ length: 15 }, (_, i) =>
      scored(new Date(Date.UTC(2026, 8, i + 1)).toISOString(), i),
    );
    expect(interviewStats(items).trend.map((p) => p.overall)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it("sums practice time only over sessions where something was said", () => {
    const stats = interviewStats([item({ durationSeconds: 300 }), item({ turns: 0, durationSeconds: 999 })]);
    expect(stats.practisedSeconds).toBe(300);
  });

  it("has nulls, not zeros, when nothing is scored yet", () => {
    expect(interviewStats([item()])).toMatchObject({ scored: 0, latest: null, best: null, trend: [] });
  });
});

describe("groupByDay", () => {
  const rows = [
    { id: "a", startedAt: "2026-10-01T18:10:00Z" },
    { id: "b", startedAt: "2026-10-01T11:25:00Z" },
    { id: "c", startedAt: "2026-09-30T21:28:00Z" },
    { id: "d", startedAt: "2026-09-17T22:43:00Z" },
  ];

  it("labels today and yesterday and keeps order within a day", () => {
    const groups = groupByDay(rows, { now: NOW, timeZone: "UTC" });
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      ["Thu, 17 Sept 2026", ["d"]],
    ]);
  });

  it("groups by the viewer's day, not UTC's", () => {
    // 22:28 UTC on the 30th is already 1 Oct in Paris (UTC+2).
    expect(dayKey("2026-09-30T22:28:00Z", "Europe/Paris")).toBe("2026-10-01");
    const groups = groupByDay(rows, { now: NOW, timeZone: "Europe/Paris" });
    expect(groups[0]).toMatchObject({ label: "Today" });
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
    // 17 Sept 22:43 UTC is 18 Sept in Paris.
    expect(groups.at(-1)!.label).toBe("Fri, 18 Sept 2026");
  });
});

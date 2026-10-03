import { describe, expect, it } from "vitest";

import { nextStreak, starsForScore, utcDay, xpForSession } from "@/lib/progression";

describe("xpForSession", () => {
  it("awards 1.5× the score plus a minute-per-XP duration bonus for a full interview", () => {
    expect(xpForSession({ overall: 65, durationSeconds: 399, drill: false })).toBe(98 + 7);
  });

  it("treats an unknown duration as no bonus", () => {
    expect(xpForSession({ overall: 40, durationSeconds: null, drill: false })).toBe(60);
  });

  it("gives a drill at least 15 XP, however low the score", () => {
    expect(xpForSession({ overall: 0, durationSeconds: 0, drill: true })).toBe(15);
  });

  it("caps a perfect drill at 40 XP before the duration bonus", () => {
    expect(xpForSession({ overall: 100, durationSeconds: 120, drill: true })).toBe(40 + 2);
  });

  it("never lets a drill out-earn the same score as a full interview", () => {
    for (let overall = 0; overall <= 100; overall += 5) {
      expect(xpForSession({ overall, durationSeconds: 120, drill: true })).toBeLessThanOrEqual(
        Math.max(15 + 2, xpForSession({ overall, durationSeconds: 120, drill: false })),
      );
    }
  });
});

describe("starsForScore", () => {
  it.each([
    [0, 0],
    [54, 0],
    [55, 1],
    [69, 1],
    [70, 2],
    [84, 2],
    [85, 3],
    [100, 3],
  ])("%i → %i stars", (overall, stars) => {
    expect(starsForScore(overall)).toBe(stars);
  });
});

describe("nextStreak", () => {
  const now = new Date("2026-10-01T09:30:00Z");

  it("starts a first-ever streak at 1", () => {
    expect(nextStreak(0, null, now)).toBe(1);
  });

  it("leaves the streak alone for a second session the same UTC day", () => {
    expect(nextStreak(4, "2026-10-01", now)).toBe(4);
  });

  it("repairs a zero streak on a same-day session", () => {
    expect(nextStreak(0, "2026-10-01", now)).toBe(1);
  });

  it("extends the streak after yesterday's session", () => {
    expect(nextStreak(4, "2026-09-30", now)).toBe(5);
  });

  it("resets to 1 after a missed day (no streak freezes, specs §8.3)", () => {
    expect(nextStreak(4, "2026-09-29", now)).toBe(1);
  });

  it("uses UTC days, not local ones, across midnight", () => {
    const justAfterMidnightUtc = new Date("2026-10-01T00:05:00Z");
    expect(utcDay(justAfterMidnightUtc)).toBe("2026-10-01");
    expect(nextStreak(2, "2026-09-30", justAfterMidnightUtc)).toBe(3);
  });

  it("handles month boundaries", () => {
    expect(nextStreak(9, "2026-09-30", new Date("2026-10-01T23:59:00Z"))).toBe(10);
    expect(nextStreak(9, "2026-02-28", new Date("2026-03-01T12:00:00Z"))).toBe(10);
  });
});

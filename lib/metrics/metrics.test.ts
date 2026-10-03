import { describe, expect, it } from "vitest";

import {
  answerStats,
  assessFillers,
  assessPace,
  assessPause,
  assessTalkRatio,
  formatClock,
  scoreStatus,
  timingIsReliable,
  wordCount,
} from "@/lib/metrics/assessment";
import { computeDeterministicMetrics, type Turn } from "@/lib/metrics/deterministic";
import { countFillers } from "@/lib/metrics/filler-words";

describe("countFillers", () => {
  it("matches French fillers on word boundaries, case-insensitively", () => {
    expect(countFillers("Euh, du coup j'ai fait ça. Voilà.", "fr")).toBe(3);
  });

  it("handles accented fillers that \\b would miss", () => {
    expect(countFillers("voilà voilà", "fr")).toBe(2);
  });

  it("does not match fillers inside other words", () => {
    // "ben" inside "Benjamin", "like" inside "likely", "um" inside "umbrella"
    expect(countFillers("Benjamin", "fr")).toBe(0);
    expect(countFillers("It is likely an umbrella", "en")).toBe(0);
  });

  it("counts multi-word English phrases", () => {
    expect(countFillers("You know, I mean, it was sort of fine", "en")).toBe(3);
  });

  it("returns 0 for empty text", () => {
    expect(countFillers("", "en")).toBe(0);
  });
});

describe("computeDeterministicMetrics", () => {
  const turns: Turn[] = [
    { role: "interviewer", transcript: "Tell me about yourself.", start_ms: 0, end_ms: 2_000 },
    // 3s thinking pause, then 60 words in 30s → 120 wpm
    { role: "candidate", transcript: Array(60).fill("word").join(" "), start_ms: 5_000, end_ms: 35_000 },
    { role: "interviewer", transcript: "And why this role?", start_ms: 36_000, end_ms: 38_000 },
    // 1s pause, 20 words in 10s, two fillers
    { role: "candidate", transcript: `um ${Array(18).fill("word").join(" ")} uh`, start_ms: 39_000, end_ms: 49_000 },
  ];

  it("computes pace from candidate speaking time only", () => {
    const m = computeDeterministicMetrics(turns, "en");
    expect(m.pace_wpm).toBeCloseTo(80 / (40 / 60));
  });

  it("computes fillers per 100 candidate words", () => {
    expect(computeDeterministicMetrics(turns, "en").filler_rate).toBeCloseTo((2 / 80) * 100);
  });

  it("computes talk ratio over the whole session span", () => {
    expect(computeDeterministicMetrics(turns, "en").talk_ratio).toBeCloseTo(40_000 / 49_000);
  });

  it("takes the longest interviewer→candidate gap as the pause", () => {
    expect(computeDeterministicMetrics(turns, "en").longest_pause_ms).toBe(3_000);
  });

  it("averages answer length and reports word-count variance", () => {
    const m = computeDeterministicMetrics(turns, "en");
    expect(m.avg_answer_seconds).toBe(20);
    expect(m.answer_length_variance).toBe(400); // counts 60 and 20, mean 40
  });

  it("returns zeros rather than NaN for an empty session", () => {
    const m = computeDeterministicMetrics([], "fr");
    for (const value of Object.values(m)) {
      expect(value).toBe(0);
    }
  });
});

describe("assessment bands", () => {
  it.each([
    [200, "fix"],
    [170, "watch"],
    [140, "good"],
    [120, "good"],
    [110, "watch"],
    [80, "fix"],
  ] as const)("pace %i wpm → %s", (wpm, status) => {
    expect(assessPace(wpm).status).toBe(status);
  });

  it.each([
    [1, "good"],
    [3, "watch"],
    [6, "watch"],
    [7, "fix"],
  ] as const)("fillers %i/100 → %s", (rate, status) => {
    expect(assessFillers(rate).status).toBe(status);
  });

  it.each([
    [0.9, "fix"],
    [0.75, "watch"],
    [0.6, "good"],
    [0.45, "watch"],
    [0.2, "fix"],
  ] as const)("talk ratio %f → %s", (ratio, status) => {
    expect(assessTalkRatio(ratio).status).toBe(status);
  });

  it.each([
    [1000, "good"],
    [4000, "watch"],
    [7000, "fix"],
  ] as const)("pause %ims → %s", (ms, status) => {
    expect(assessPause(ms).status).toBe(status);
  });

  it("maps scores to statuses at 55 and 70", () => {
    expect(scoreStatus(54)).toBe("fix");
    expect(scoreStatus(55)).toBe("watch");
    expect(scoreStatus(70)).toBe("good");
  });
});

describe("timingIsReliable", () => {
  it("accepts back-to-back turns, including a barge-in at the same instant", () => {
    expect(
      timingIsReliable([
        { role: "interviewer", transcript: "a", start_ms: 0, end_ms: 1000 },
        { role: "candidate", transcript: "b", start_ms: 1000, end_ms: 2000 },
      ]),
    ).toBe(true);
  });

  it("rejects pre-fix sessions whose turns overlap by seconds", () => {
    expect(
      timingIsReliable([
        { role: "interviewer", transcript: "a", start_ms: 6700, end_ms: 15000 },
        { role: "candidate", transcript: "b", start_ms: 6699, end_ms: 11000 },
      ]),
    ).toBe(false);
  });

  it("rejects turns with missing timestamps and empty sessions", () => {
    expect(timingIsReliable([{ role: "candidate", transcript: "b" }])).toBe(false);
    expect(timingIsReliable([])).toBe(false);
  });
});

describe("answerStats / wordCount / formatClock", () => {
  it("counts words on any whitespace", () => {
    expect(wordCount("  one\ttwo\nthree  ")).toBe(3);
    expect(wordCount("   ")).toBe(0);
  });

  it("hides the longest answer when timing is unreliable", () => {
    const turns = [{ role: "candidate" as const, transcript: "a b c", start_ms: 0, end_ms: 9000 }];
    expect(answerStats(turns, false)).toEqual({ answers: 1, avgWords: 3, longestAnswerSeconds: null });
    expect(answerStats(turns, true).longestAnswerSeconds).toBe(9);
  });

  it("formats a clock and never goes negative", () => {
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(-500)).toBe("0:00");
  });
});

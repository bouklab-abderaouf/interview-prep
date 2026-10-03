// Turns the scorecard's raw numbers into something a candidate can act on: a
// good / watch / fix status and a sentence saying which way to move. Pure, so
// both the real scorecard and /sample-scorecard get identical judgments.
//
// Only pace's 120–160 wpm comes from the spec (§7.4's own example). The other
// bands are judgment calls, kept here in one place so they're easy to revisit.

export type Status = "good" | "watch" | "fix";

export interface Assessment {
  status: Status;
  advice: string;
}

export interface TimedTurn {
  role: "interviewer" | "candidate";
  transcript: string;
  start_ms?: number;
  end_ms?: number;
}

export function scoreStatus(score: number): Status {
  if (score >= 70) return "good";
  if (score >= 55) return "watch";
  return "fix";
}

export function assessPace(wpm: number): Assessment {
  if (wpm > 190) return { status: "fix", advice: "Much too fast — slow down so the interviewer can follow." };
  if (wpm > 160) return { status: "watch", advice: "A bit fast — aim for 120–160 wpm." };
  if (wpm >= 120) return { status: "good", advice: "A natural speaking pace." };
  if (wpm >= 100) return { status: "watch", advice: "A bit slow — tighten your sentences." };
  return { status: "fix", advice: "Very slow — long hesitations are breaking up your answers." };
}

export function assessFillers(per100Words: number): Assessment {
  if (per100Words < 3) return { status: "good", advice: "Unremarkable — nobody will notice." };
  if (per100Words <= 6) return { status: "watch", advice: "Noticeable — replace fillers with a short pause." };
  return { status: "fix", advice: "Distracting — practise pausing silently instead of filling." };
}

export function assessTalkRatio(ratio: number): Assessment {
  if (ratio > 0.8) return { status: "fix", advice: "You dominated the conversation — leave room for questions." };
  if (ratio > 0.7) return { status: "watch", advice: "On the long side — tighten your answers." };
  if (ratio >= 0.5) return { status: "good", advice: "Healthy — you carried the conversation." };
  if (ratio >= 0.4) return { status: "watch", advice: "A little short — develop your answers further." };
  return { status: "fix", advice: "Too little — your answers need more substance." };
}

export function assessPause(ms: number): Assessment {
  if (ms > 6000) return { status: "fix", advice: "A long silence — buy time out loud (\"let me think about that\")." };
  if (ms > 3000) return { status: "watch", advice: "Noticeable — fine once, not as a habit." };
  return { status: "good", advice: "You answered without awkward silences." };
}

export function assessClarity(score: number): Assessment {
  const status = scoreStatus(score);
  if (status === "good") return { status, advice: "Easy to follow." };
  if (status === "watch") return { status, advice: "Mostly clear — lead with the point, then the detail." };
  return { status, advice: "Hard to follow — structure each answer before diving in." };
}

// Interviews recorded before the turn-timing fix (lib/live/turn-timeline.ts)
// have timestamps taken from transcription arrival, which makes neighbouring
// turns overlap by seconds. Correctly timed turns never overlap — a barge-in
// ends one turn at the exact moment the next begins — so any real overlap
// means the timing-derived metrics (pace, pauses, talk ratio) are fiction and
// shouldn't be shown as fact.
const OVERLAP_TOLERANCE_MS = 500;

export function timingIsReliable(turns: TimedTurn[]): boolean {
  const timed = turns.filter((t) => t.start_ms !== undefined && t.end_ms !== undefined);
  if (timed.length !== turns.length || timed.length === 0) return false;
  const sorted = [...timed].sort((a, b) => a.start_ms! - b.start_ms!);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start_ms! < sorted[i - 1].end_ms! - OVERLAP_TOLERANCE_MS) return false;
  }
  return true;
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export interface AnswerStats {
  answers: number;
  avgWords: number;
  /** null when timing can't be trusted */
  longestAnswerSeconds: number | null;
}

export function answerStats(turns: TimedTurn[], reliableTiming: boolean): AnswerStats {
  const answers = turns.filter((t) => t.role === "candidate");
  const words = answers.map((t) => wordCount(t.transcript));
  const durations = reliableTiming
    ? answers.map((t) => ((t.end_ms ?? 0) - (t.start_ms ?? 0)) / 1000)
    : [];
  return {
    answers: answers.length,
    avgWords: words.length ? Math.round(words.reduce((a, b) => a + b, 0) / words.length) : 0,
    longestAnswerSeconds: durations.length ? Math.round(Math.max(...durations)) : null,
  };
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

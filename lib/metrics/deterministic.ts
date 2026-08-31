import type { InterviewLanguage } from "@/lib/live/types";
import { countFillers } from "@/lib/metrics/filler-words";

export interface Turn {
  role: "interviewer" | "candidate";
  transcript: string;
  start_ms: number;
  end_ms: number;
}

export interface DeterministicMetrics {
  pace_wpm: number;
  filler_rate: number;
  talk_ratio: number;
  longest_pause_ms: number;
  avg_answer_seconds: number;
  answer_length_variance: number;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}

// specs §7.2 — computed in TypeScript, zero model calls. The model comments
// on these numbers (lib/prompts/scoring.ts) but never computes them.
export function computeDeterministicMetrics(
  turns: Turn[],
  language: InterviewLanguage,
): DeterministicMetrics {
  const candidateTurns = turns.filter((t) => t.role === "candidate");

  const totalMs = turns.length
    ? Math.max(...turns.map((t) => t.end_ms)) - Math.min(...turns.map((t) => t.start_ms))
    : 0;
  const candidateMs = candidateTurns.reduce((sum, t) => sum + (t.end_ms - t.start_ms), 0);

  const candidateWordCounts = candidateTurns.map((t) => wordCount(t.transcript));
  const totalCandidateWords = candidateWordCounts.reduce((sum, n) => sum + n, 0);

  const candidateMinutes = candidateMs / 60_000;
  const pace_wpm = candidateMinutes > 0 ? totalCandidateWords / candidateMinutes : 0;

  const totalFillers = candidateTurns.reduce(
    (sum, t) => sum + countFillers(t.transcript, language),
    0,
  );
  const filler_rate = totalCandidateWords > 0 ? (totalFillers / totalCandidateWords) * 100 : 0;

  const talk_ratio = totalMs > 0 ? candidateMs / totalMs : 0;

  // Longest pause: gap between an interviewer turn ending and the candidate's
  // next turn starting — the "thinking pause" before an answer.
  let longest_pause_ms = 0;
  for (let i = 0; i < turns.length - 1; i++) {
    if (turns[i].role === "interviewer" && turns[i + 1].role === "candidate") {
      const gap = turns[i + 1].start_ms - turns[i].end_ms;
      if (gap > longest_pause_ms) longest_pause_ms = gap;
    }
  }

  const avg_answer_seconds =
    candidateTurns.length > 0 ? candidateMs / candidateTurns.length / 1000 : 0;

  // Flags one-word answers and 5-minute rambles: high variance in candidate
  // turn length means inconsistent answer depth, not just a single outlier.
  const answer_length_variance = variance(candidateWordCounts);

  return {
    pace_wpm,
    filler_rate,
    talk_ratio,
    longest_pause_ms,
    avg_answer_seconds,
    answer_length_variance,
  };
}

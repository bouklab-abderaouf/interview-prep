import type { InterviewLanguage } from "@/lib/live/types";
import type { Turn, DeterministicMetrics } from "@/lib/metrics/deterministic";

interface CandidateFacts {
  top_skills: string[];
  notable_projects: { title: string; summary: string; technologies: string[] }[];
}

interface GapItem {
  requirement: string;
  severity: "blocking" | "significant" | "minor";
  mitigation_angle: string;
}

interface BuildScoringPromptParams {
  turns: Turn[];
  focusAreas: string[];
  questionBank: string[];
  gaps: GapItem[];
  candidate: CandidateFacts;
  metrics: DeterministicMetrics;
  language: InterviewLanguage;
}

function formatTranscript(turns: Turn[]): string {
  return turns.map((t) => `[${t.role}] ${t.transcript}`).join("\n");
}

// specs §7.3 — full transcript, the stage's focus_areas/question_bank, the
// roadmap's gaps, and the deterministic metrics (so the model can comment on
// them but not compute them) go in; a Scorecard comes out.
export function buildScoringPrompt({
  turns,
  focusAreas,
  questionBank,
  gaps,
  candidate,
  metrics,
  language,
}: BuildScoringPromptParams): string {
  return [
    "You are scoring a completed mock interview transcript.",
    "",
    `Write all text output in ${language === "fr" ? "French" : "English"}.`,
    "Be harsh and specific about a genuinely weak answer. Do not be sycophantic about a genuinely good one — grounded, specific praise only.",
    "Every strength's quote_from_answer must be copied verbatim from the candidate's transcript lines below — do not paraphrase or invent a quote.",
    "Model answers must use facts from the candidate's own CV (skills and projects listed below), not invented experience.",
    "You are given deterministic metrics (pace, filler rate, talk ratio, pause length) already computed — comment on them, do not recompute them.",
    "",
    `Stage focus areas: ${focusAreas.join(", ")}`,
    `Stage question bank: ${questionBank.join(" | ")}`,
    `Known gaps between this candidate's CV and the target role: ${gaps.map((g) => `[${g.severity}] ${g.requirement}`).join(" | ")}`,
    `Candidate's CV skills: ${candidate.top_skills.join(", ")}`,
    `Candidate's CV projects: ${candidate.notable_projects.map((p) => `${p.title} (${p.technologies.join(", ")}): ${p.summary}`).join(" | ")}`,
    "",
    "Deterministic metrics:",
    `pace_wpm=${metrics.pace_wpm.toFixed(0)}, filler_rate=${metrics.filler_rate.toFixed(1)}/100 words, talk_ratio=${(metrics.talk_ratio * 100).toFixed(0)}%, longest_pause_ms=${metrics.longest_pause_ms}, avg_answer_seconds=${metrics.avg_answer_seconds.toFixed(0)}, answer_length_variance=${metrics.answer_length_variance.toFixed(0)}`,
    "",
    "Transcript:",
    formatTranscript(turns),
    "",
    "Output JSON matching the provided schema, nothing else.",
  ].join("\n");
}

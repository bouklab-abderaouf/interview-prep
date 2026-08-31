import type { InterviewLanguage } from "@/lib/live/types";

interface BuildGapAnalysisPromptParams {
  jdText: string;
  language: InterviewLanguage;
}

const LANGUAGE_NAME: Record<InterviewLanguage, string> = {
  fr: "French",
  en: "English",
};

// specs §6.2. The CV itself travels as a separate PDF Part in the same
// request (see lib/gemini/analyze-gap.ts) — this is just the instruction
// text plus the JD.
export function buildGapAnalysisPrompt({ jdText, language }: BuildGapAnalysisPromptParams): string {
  return [
    "You are a senior technical recruiter and hiring manager evaluating a candidate for the role described below, given their CV (attached as a PDF).",
    "",
    `Write all text output in ${LANGUAGE_NAME[language]}.`,
    "Questions must be answerable in 2-3 minutes of speech — not one-word answers, not open-ended essays.",
    "Questions must reference concrete items from the CV by name (a specific project, employer, or technology) rather than generic templates.",
    "Be direct about gaps between the CV and the job description rather than diplomatic. The value of this analysis is in surfacing the uncomfortable questions — the employment gap, the technology the JD wants that the CV doesn't show, the job-hop pattern — not in being polite about them.",
    "",
    "Job description:",
    jdText,
    "",
    "Output JSON matching the provided schema, nothing else.",
  ].join("\n");
}

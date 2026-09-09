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
    "Be direct about gaps between the CV and the job description rather than diplomatic. The value of this analysis is in surfacing the uncomfortable questions — the employment gap, the technology the JD wants that the CV doesn't show, the job-hop pattern — not in being polite about them. `gaps` and `risk_questions` are where that bluntness belongs.",
    "",
    // Every question used to be required to name a CV item, which produced
    // banks with no opening question at all — a real recruiter screen came
    // back leading with "explain the date overlap between these two jobs".
    // Ordering the bank like an actual interview is the fix; the pointed
    // questions still get asked, just not first.
    "Each stage's `questions` array must read like the running order of a real interview, not a list of challenges:",
    "- The first question opens the conversation: broad, about the candidate's own background, motivation, or what drew them to this role. It must be answerable without the candidate having to defend anything, and it should not depend on a specific CV detail.",
    "- The middle questions go deeper into the stage's focus areas, and these must reference concrete items from the CV by name (a specific project, employer, or technology) rather than generic templates.",
    "- The most uncomfortable questions — a date that doesn't line up, missing years of experience, a technology the role needs and the CV lacks — go last, never first.",
    "",
    "Job description:",
    jdText,
    "",
    "Output JSON matching the provided schema, nothing else.",
  ].join("\n");
}

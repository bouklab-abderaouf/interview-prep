import type { InterviewLanguage, InterviewMode } from "@/lib/live/types";

interface BuildInterviewerPromptParams {
  mode: InterviewMode;
  language: InterviewLanguage;
}

const OPENING: Record<InterviewLanguage, string> = {
  fr: "Tu es un recruteur technique qui mène un entretien d'embauche oral.",
  en: "You are a technical recruiter conducting a live spoken job interview.",
};

/**
 * Phase 0 walking-skeleton prompt: no roadmap/stage/CV data exists yet
 * (no database in Phase 0), so this is deliberately generic. Phase 2 replaces
 * this with a stage-specific prompt built from the gap analysis (see
 * lib/prompts/gap-analysis.ts and stages.persona).
 */
export function buildInterviewerPrompt({
  mode,
  language,
}: BuildInterviewerPromptParams): string {
  const lines = [
    OPENING[language],
    "Ask one question at a time and wait for the candidate's full answer before responding.",
    "Keep your own turns short — this is a conversation, not a monologue.",
    language === "fr"
      ? "Réponds toujours en français."
      : "Always respond in English.",
  ];

  if (mode === "demo") {
    lines.push(
      language === "fr"
        ? "Ceci est une démo de deux minutes : reste sur des questions générales d'entretien."
        : "This is a two-minute demo: stick to general interview questions.",
    );
  }

  return lines.join(" ");
}

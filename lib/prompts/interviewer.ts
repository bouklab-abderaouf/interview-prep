import type { InterviewLanguage, InterviewMode } from "@/lib/live/types";
import type { DemoScenario } from "@/lib/fixtures/demo-scenario";

interface BuildInterviewerPromptParams {
  mode: InterviewMode;
  language: InterviewLanguage;
  /** specs §5.2 — the demo's fixture CV/JD, passed through so even this
   * generic Phase 1 prompt has real material to probe. Phase 2 replaces this
   * with the real gap-analysis pipeline for authenticated ('full') sessions. */
  scenario?: DemoScenario;
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
  scenario,
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

  if (scenario) {
    lines.push(
      language === "fr"
        ? `Voici le CV du candidat : ${scenario.cvSummary} Voici l'offre visée : ${scenario.jdSummary} Pose au moins une question directe qui sonde un vrai décalage entre le CV et l'offre, sans être diplomate à ce sujet.`
        : `Here is the candidate's CV: ${scenario.cvSummary} Here is the job description: ${scenario.jdSummary} Ask at least one direct question probing a real gap between the CV and the JD — don't be diplomatic about it.`,
    );
  }

  return lines.join(" ");
}

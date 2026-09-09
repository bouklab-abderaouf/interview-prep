import { GoogleGenAI } from "@google/genai";
import { toJSONSchema } from "zod";

import { Scorecard, type Scorecard as ScorecardType } from "@/lib/gemini/schemas";
import { buildScoringPrompt } from "@/lib/prompts/scoring";
import { withRetry } from "@/lib/gemini/retry";
import type { Turn, DeterministicMetrics } from "@/lib/metrics/deterministic";
import type { InterviewLanguage } from "@/lib/live/types";

interface CandidateFacts {
  top_skills: string[];
  notable_projects: { title: string; summary: string; technologies: string[] }[];
}

interface GapItem {
  requirement: string;
  severity: "blocking" | "significant" | "minor";
  mitigation_angle: string;
}

const responseJsonSchema = toJSONSchema(Scorecard);

// specs §7.3 — one Gemini text call producing the Scorecard.
export async function scoreSession(params: {
  turns: Turn[];
  focusAreas: string[];
  questionBank: string[];
  gaps: GapItem[];
  candidate: CandidateFacts;
  metrics: DeterministicMetrics;
  language: InterviewLanguage;
}): Promise<ScorecardType> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_TEXT_MODEL;
  if (!apiKey || !model) {
    throw new Error("GEMINI_API_KEY or GEMINI_TEXT_MODEL not configured");
  }

  const client = new GoogleGenAI({ apiKey });
  const prompt = buildScoringPrompt(params);

  // More patient than the default, and deliberately so: this runs once, at the
  // end of an interview that may have taken ten minutes to record, and the
  // alternative to waiting is the candidate losing that interview's scorecard.
  // A real 503 burst outlasted the default 2s/4s backoff. Still bounded, and
  // still capped low enough not to eat the free tier's daily request cap on
  // one session — the UI can retry deliberately, which is cheaper than
  // retrying speculatively here.
  const response = await withRetry(
    () =>
      client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json", responseJsonSchema },
      }),
    4,
    3000,
  );

  const text = response.text;
  if (!text) throw new Error("Gemini returned no text content");

  const parsed = Scorecard.parse(JSON.parse(text));

  // `quote_from_answer` forces feedback to be grounded rather than generic
  // — validate it actually appears in the transcript; drop the strength if
  // not. Filtered (not re-validated through Zod's min(1)): in the rare case
  // every quote is hallucinated, an empty strengths array is more honest
  // than either throwing or keeping an unverified quote.
  const fullTranscript = params.turns.map((t) => t.transcript).join("\n");
  const strengths = parsed.strengths.filter((s) => fullTranscript.includes(s.quote_from_answer));

  return { ...parsed, strengths };
}

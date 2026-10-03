import { GoogleGenAI } from "@google/genai";
import { toJSONSchema } from "zod";

import { fakeScorecard, geminiIsFaked } from "@/lib/gemini/fake";
import { Scorecard, type Scorecard as ScorecardType } from "@/lib/gemini/schemas";
import { buildScoringPrompt } from "@/lib/prompts/scoring";
import { textModels, withModelFallback } from "@/lib/gemini/retry";
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
  drill?: boolean;
  targetQuestion?: string;
}): Promise<ScorecardType> {
  // Signed-in browser tests against a local Supabase only (lib/gemini/fake.ts).
  if (geminiIsFaked()) return fakeScorecard(params.turns.filter((t) => t.role === "candidate").map((t) => t.transcript));

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const client = new GoogleGenAI({ apiKey });
  const prompt = buildScoringPrompt(params);

  // More patient than the default, and deliberately so: this runs once, at the
  // end of an interview that may have taken ten minutes to record, and the
  // alternative to waiting is the candidate losing that interview's scorecard.
  // A real 503 burst outlasted the default 2s/4s backoff. Still bounded, and
  // still capped low enough not to eat the free tier's daily request cap on
  // one session — the UI can retry deliberately, which is cheaper than
  // retrying speculatively here.
  const response = await withModelFallback(
    textModels(),
    (model) =>
      client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json", responseJsonSchema },
      }),
    { attemptsPerModel: 3, baseDelayMs: 3000, label: "scoring" },
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

  // bank_index drives a "drill this question" link, so an out-of-range index
  // must not survive; scores are clamped for the same reason overall is.
  const per_question = parsed.per_question.map((q) => ({
    ...q,
    bank_index:
      Number.isInteger(q.bank_index) && q.bank_index >= 0 && q.bank_index < params.questionBank.length
        ? q.bank_index
        : -1,
    score: Math.max(0, Math.min(100, Math.round(q.score))),
  }));

  return { ...parsed, strengths, per_question };
}

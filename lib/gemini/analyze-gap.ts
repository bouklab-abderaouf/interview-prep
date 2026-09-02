import { createHash } from "node:crypto";

import { GoogleGenAI } from "@google/genai";
import { z, toJSONSchema } from "zod";

import { GapAnalysis, type GapAnalysis as GapAnalysisType } from "@/lib/gemini/schemas";
import { buildGapAnalysisPrompt } from "@/lib/prompts/gap-analysis";
import { withRetry } from "@/lib/gemini/retry";
import type { InterviewLanguage } from "@/lib/live/types";

// specs §6.2 — cache keyed on hash(cv_bytes + jd_text + language) so re-runs
// during development cost nothing. In-memory: resets on server restart,
// matching the spec's own "during development" framing — this isn't meant
// to survive across deploys or serverless cold starts.
const cache = new Map<string, GapAnalysisType>();

function cacheKey(cvBytes: Buffer, jdText: string, language: InterviewLanguage): string {
  return createHash("sha256").update(cvBytes).update(jdText).update(language).digest("hex");
}

// Gemini's structured output has an undocumented combined depth/complexity
// budget. The full GapAnalysis schema — stages[].questions[].follow_ups[] is
// 3 arrays deep, alongside 5 sibling top-level fields — reliably fails with a
// generic 400 INVALID_ARGUMENT. Confirmed by bisection: a schema that deep OR
// that broad works in isolation, just not combined. Split into two calls —
// the PDF-attached primary call omits follow_ups (fits the budget), a cheap
// text-only follow-up call adds them (fits alone) — then merge. The public
// GapAnalysis type this module returns is unaffected; the split is an
// internal workaround. These two schemas duplicate schemas.ts's stage/
// question shape rather than deriving it, so keep them in sync by hand if
// that shape changes.

const StageSlug = z.enum(["recruiter_screen", "technical", "behavioral", "system_design"]);

const PrimaryQuestion = z.object({
  text: z.string(),
  targets: z.string(),
});

const PrimaryStage = z.object({
  slug: StageSlug,
  title: z.string(),
  description: z.string(),
  focus_areas: z.array(z.string()).max(5),
  persona: z.object({
    name: z.string(),
    role: z.string(),
    tone: z.enum(["warm", "neutral", "skeptical"]),
    strictness: z.number().min(1).max(5),
  }),
  questions: z.array(PrimaryQuestion).min(5).max(10),
});

const GapAnalysisPrimary = z.object({
  candidate: GapAnalysis.shape.candidate,
  role: GapAnalysis.shape.role,
  overlap: GapAnalysis.shape.overlap,
  gaps: GapAnalysis.shape.gaps,
  risk_questions: GapAnalysis.shape.risk_questions,
  stages: z.array(PrimaryStage).length(4),
});
type GapAnalysisPrimaryType = z.infer<typeof GapAnalysisPrimary>;

const FollowUpsResult = z.object({
  stages: z
    .array(
      z.object({
        questions: z.array(z.object({ follow_ups: z.array(z.string()).max(3) })),
      }),
    )
    .length(4),
});

const primaryResponseSchema = toJSONSchema(GapAnalysisPrimary);
const followUpsResponseSchema = toJSONSchema(FollowUpsResult);

async function generatePrimary(
  client: GoogleGenAI,
  model: string,
  cvBytes: Buffer,
  jdText: string,
  language: InterviewLanguage,
): Promise<GapAnalysisPrimaryType> {
  const response = await withRetry(() =>
    client.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: buildGapAnalysisPrompt({ jdText, language }) },
            { inlineData: { data: cvBytes.toString("base64"), mimeType: "application/pdf" } },
          ],
        },
      ],
      config: { responseMimeType: "application/json", responseJsonSchema: primaryResponseSchema },
    }),
  );

  const text = response.text;
  if (!text) throw new Error("Gemini returned no text content (primary call)");
  return GapAnalysisPrimary.parse(JSON.parse(text));
}

async function generateFollowUps(
  client: GoogleGenAI,
  model: string,
  stages: GapAnalysisPrimaryType["stages"],
  language: InterviewLanguage,
): Promise<z.infer<typeof FollowUpsResult>> {
  const prompt = [
    language === "fr"
      ? "Pour chaque question ci-dessous, propose jusqu'à 3 questions de relance courtes qui approfondissent la même réponse."
      : "For each question below, propose up to 3 short follow-up questions that dig deeper into the same answer.",
    "Preserve the exact stage and question order from the input — output one follow_ups array per question, in order.",
    "",
    JSON.stringify(
      stages.map((stage) => ({
        title: stage.title,
        questions: stage.questions.map((q) => ({ text: q.text, targets: q.targets })),
      })),
    ),
  ].join("\n");

  const response = await withRetry(() =>
    client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json", responseJsonSchema: followUpsResponseSchema },
    }),
  );

  const text = response.text;
  if (!text) throw new Error("Gemini returned no text content (follow-ups call)");
  return FollowUpsResult.parse(JSON.parse(text));
}

export async function analyzeGap(params: {
  cvBytes: Buffer;
  jdText: string;
  language: InterviewLanguage;
}): Promise<GapAnalysisType> {
  const { cvBytes, jdText, language } = params;

  const key = cacheKey(cvBytes, jdText, language);
  const cached = cache.get(key);
  if (cached) return cached;

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_TEXT_MODEL;
  if (!apiKey || !model) {
    throw new Error("GEMINI_API_KEY or GEMINI_TEXT_MODEL not configured");
  }

  const client = new GoogleGenAI({ apiKey });

  const primary = await generatePrimary(client, model, cvBytes, jdText, language);
  const followUps = await generateFollowUps(client, model, primary.stages, language);

  const stages = primary.stages.map((stage, stageIndex) => ({
    ...stage,
    questions: stage.questions.map((question, questionIndex) => ({
      ...question,
      follow_ups: followUps.stages[stageIndex].questions[questionIndex]?.follow_ups ?? [],
    })),
  }));

  const parsed = GapAnalysis.parse({ ...primary, stages });
  cache.set(key, parsed);
  return parsed;
}

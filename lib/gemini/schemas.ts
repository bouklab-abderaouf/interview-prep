import { z } from "zod";

// specs §6.1's stages[].persona / stages[].questions shape, factored out so
// Phase 3's token endpoint can validate the same shape read back out of
// stages.persona / stages.question_bank (specs §3) — those columns are
// written straight from a parsed GapAnalysis in app/api/analyze/route.ts.
export const StagePersonaSchema = z.object({
  name: z.string(),
  role: z.string(),
  tone: z.enum(["warm", "neutral", "skeptical"]),
  strictness: z.number().min(1).max(5),
});

export const StageQuestionSchema = z.object({
  text: z.string(),
  // which gap or requirement it probes
  targets: z.string(),
  follow_ups: z.array(z.string()).max(3),
});

// specs §6.1 — mirrored as the Gemini responseJsonSchema. Keep this exact
// shape: app/api/analyze/route.ts inserts stages/gap_analysis straight from
// a parsed instance of this schema into the DB.
export const GapAnalysis = z.object({
  candidate: z.object({
    name: z.string().nullable(),
    years_experience: z.number(),
    current_title: z.string().nullable(),
    top_skills: z.array(z.string()).max(15),
    notable_projects: z
      .array(
        z.object({
          title: z.string(),
          summary: z.string(),
          technologies: z.array(z.string()),
        }),
      )
      .max(6),
  }),
  role: z.object({
    title: z.string(),
    company: z.string().nullable(),
    seniority: z.enum(["junior", "mid", "senior", "lead", "unclear"]),
    must_have: z.array(z.string()).max(12),
    nice_to_have: z.array(z.string()).max(10),
  }),
  overlap: z.array(
    z.object({
      requirement: z.string(),
      evidence_in_cv: z.string(),
      strength: z.enum(["strong", "partial"]),
    }),
  ),
  gaps: z.array(
    z.object({
      requirement: z.string(),
      severity: z.enum(["blocking", "significant", "minor"]),
      // how to talk around it honestly in an interview
      mitigation_angle: z.string(),
    }),
  ),
  // questions this CV invites
  risk_questions: z.array(z.string()).max(8),
  stages: z
    .array(
      z.object({
        slug: z.enum(["recruiter_screen", "technical", "behavioral", "system_design"]),
        title: z.string(),
        description: z.string(),
        focus_areas: z.array(z.string()).max(5),
        persona: StagePersonaSchema,
        questions: z.array(StageQuestionSchema).min(5).max(10),
      }),
    )
    .length(4),
});

export type GapAnalysis = z.infer<typeof GapAnalysis>;

// specs §7.3 — mirrored as the Gemini responseJsonSchema for
// POST /api/sessions/:id/score. Shallower than GapAnalysis (no array nested
// inside another array), so it doesn't hit the complexity budget documented
// in lib/gemini/analyze-gap.ts — one call is enough here.
export const Scorecard = z.object({
  overall: z.number().min(0).max(100),
  star: z.object({
    situation: z.number(),
    task: z.number(),
    action: z.number(),
    result: z.number(),
  }),
  relevance: z.number(),
  clarity: z.number(),
  strengths: z
    .array(
      z.object({
        point: z.string(),
        // must be verbatim from the transcript — validated in
        // lib/gemini/score-session.ts, not just trusted from the model.
        quote_from_answer: z.string(),
      }),
    )
    .min(1)
    .max(4),
  improvements: z
    .array(
      z.object({
        point: z.string(),
        why_it_matters: z.string(),
        what_to_say_instead: z.string(),
      }),
    )
    .min(1)
    .max(4),
  model_answers: z
    .array(
      z.object({
        question: z.string(),
        // 150-200 words, first person, uses the candidate's own CV facts
        strong_answer: z.string(),
      }),
    )
    .max(3),
});

export type Scorecard = z.infer<typeof Scorecard>;

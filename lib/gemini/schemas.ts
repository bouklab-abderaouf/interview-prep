import { z } from "zod";

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
        persona: z.object({
          name: z.string(),
          role: z.string(),
          tone: z.enum(["warm", "neutral", "skeptical"]),
          strictness: z.number().min(1).max(5),
        }),
        questions: z
          .array(
            z.object({
              text: z.string(),
              // which gap or requirement it probes
              targets: z.string(),
              follow_ups: z.array(z.string()).max(3),
            }),
          )
          .min(5)
          .max(10),
      }),
    )
    .length(4),
});

export type GapAnalysis = z.infer<typeof GapAnalysis>;

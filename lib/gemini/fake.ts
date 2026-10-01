import type { GapAnalysis, Scorecard } from "@/lib/gemini/schemas";

// A stand-in for Gemini's text calls, for the signed-in browser tests
// (e2e-auth/) that run against a local Supabase (production readiness
// phase 6). Gemini can't be pointed at a local server, and real calls would
// spend quota, so analysis and scoring return fixed, schema-valid results.
//
// Two conditions, both required: GEMINI_FAKE=1 and a Supabase URL on this
// machine. A real deployment never talks to a local Supabase, so a stray
// GEMINI_FAKE in a production environment can't make real users get fake
// scorecards — and there's a test for exactly that.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function geminiIsFaked(): boolean {
  if (process.env.GEMINI_FAKE !== "1") return false;
  try {
    return LOCAL_HOSTS.has(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname);
  } catch {
    return false;
  }
}

const question = (text: string, targets: string) => ({ text, targets, follow_ups: ["Can you give a concrete example?"] });

const stage = (
  slug: GapAnalysis["stages"][number]["slug"],
  title: string,
  persona: GapAnalysis["stages"][number]["persona"],
) => ({
  slug,
  title,
  description: `${title} for the e2e fixture role.`,
  focus_areas: ["Communication", "Python"],
  persona,
  questions: [
    question("Walk me through your background and what drew you to this role.", "opener"),
    question("Tell me about the retrieval pipeline you built at Acme.", "RAG experience"),
    question("How did you measure the quality of its answers?", "evaluation"),
    question("What would you do differently with more time?", "reflection"),
    question("Your CV shows no production Kubernetes. How would you get up to speed?", "gap: Kubernetes"),
  ],
});

export const FAKE_GAP_ANALYSIS: GapAnalysis = {
  candidate: {
    name: "E2E Candidate",
    years_experience: 4,
    current_title: "Python Developer",
    top_skills: ["Python", "RAG", "FastAPI"],
    notable_projects: [{ title: "Acme retrieval pipeline", summary: "Built a RAG search over internal docs.", technologies: ["Python", "pgvector"] }],
  },
  role: {
    title: "AI Engineer",
    company: "E2E Corp",
    seniority: "mid",
    must_have: ["Python", "RAG", "Kubernetes"],
    nice_to_have: ["LangGraph"],
  },
  overlap: [{ requirement: "Python", evidence_in_cv: "4 years of Python", strength: "strong" }],
  gaps: [{ requirement: "Kubernetes in production", severity: "significant", mitigation_angle: "Show transferable container experience." }],
  risk_questions: ["How would you get up to speed on Kubernetes?"],
  stages: [
    stage("recruiter_screen", "Recruiter screen", { name: "Camille", role: "Recruiter", tone: "warm", strictness: 2 }),
    stage("technical", "Technical interview", { name: "Alex", role: "Lead engineer", tone: "neutral", strictness: 4 }),
    stage("behavioral", "Behavioural interview", { name: "Sam", role: "Engineering manager", tone: "neutral", strictness: 3 }),
    stage("system_design", "System design", { name: "Jordan", role: "Staff engineer", tone: "skeptical", strictness: 5 }),
  ],
};

/** A valid scorecard whose strengths quote the transcript verbatim, as the real check requires. */
export function fakeScorecard(transcript: string[]): Scorecard {
  const quote = transcript.find((line) => line.trim().length > 0) ?? "";
  return {
    overall: 72,
    star: { situation: 70, task: 72, action: 76, result: 68 },
    relevance: 74,
    clarity: 71,
    strengths: [{ point: "Clear ownership of the work", quote_from_answer: quote }],
    improvements: [
      {
        point: "Quantify the result",
        why_it_matters: "Interviewers remember numbers.",
        what_to_say_instead: "Say how much faster or better it got.",
      },
    ],
    model_answers: [],
    per_question: [{ question: "Walk me through your background.", bank_index: 0, score: 72, verdict: "Solid and specific." }],
  };
}

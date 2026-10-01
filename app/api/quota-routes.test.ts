import { ApiError } from "@google/genai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CONSENT_VERSION } from "@/lib/legal";
import { fakeSupabase, jsonRequest, routeContext, type Op, type Result } from "@/tests/helpers/fake-supabase";

// Every route that can spend Gemini quota, exercised against a fake database
// and a fake Gemini. Nothing here reaches a real service.

const mocks = vi.hoisted(() => ({
  adminCalls: [] as Array<[string, unknown]>,
  mint: vi.fn(),
  scoreSession: vi.fn(),
  analyzeGap: vi.fn(),
}));

let fake = fakeSupabase();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      mocks.adminCalls.push([fn, args]);
      return { data: null, error: null };
    },
  }),
}));
vi.mock("@google/genai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    authTokens = { create: mocks.mint };
  },
}));
vi.mock("@/lib/gemini/score-session", () => ({ scoreSession: mocks.scoreSession }));
vi.mock("@/lib/gemini/analyze-gap", () => ({ analyzeGap: mocks.analyzeGap }));

const { POST: mintToken } = await import("@/app/api/live/token/route");
const { POST: scoreRoute } = await import("@/app/api/sessions/[id]/score/route");
const { POST: analyzeRoute } = await import("@/app/api/analyze/route");
const { POST: createSession } = await import("@/app/api/sessions/route");
const { PATCH: flushTurns } = await import("@/app/api/sessions/[id]/route");

const STAGE_ID = "5f0c6d2e-1b7a-4c3e-9a51-0d9a8b7c6e5f";
const SESSION_ID = "8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

const STAGE_ROW = {
  title: "Tech screen",
  focus_areas: ["RAG"],
  persona: { name: "Claire", role: "Lead engineer", tone: "neutral", strictness: 3 },
  question_bank: [{ text: "Walk me through a project.", targets: "intro", follow_ups: [] }],
  roadmaps: { language: "en" },
  pass_score: 60,
  order_index: 0,
  roadmap_id: "r1",
};

const GAP_ANALYSIS = {
  candidate: { name: null, years_experience: 3, current_title: null, top_skills: [], notable_projects: [] },
  role: { title: "Dev", company: null, seniority: "mid", must_have: [], nice_to_have: [] },
  overlap: [],
  gaps: [],
  risk_questions: [],
};

/** A database where the stage exists and is unlocked, and the quota answer is `allowed`. */
function database(allowed: boolean | "error", extra: (op: Op) => Result | undefined = () => undefined) {
  return (op: Op): Result | undefined => {
    const scripted = extra(op);
    if (scripted) return scripted;
    if (op.table === "rpc:consume_user_quota") {
      return allowed === "error" ? { error: { message: "down" } } : { data: allowed };
    }
    if (op.table === "stages") return { data: STAGE_ROW };
    if (op.table === "progress" && op.action === "select") return { data: { unlocked: true } };
    return undefined;
  };
}

const consumed = (ops: Op[]) => ops.filter((op) => op.table === "rpc:consume_user_quota").map((op) => op.payload);

beforeEach(() => {
  mocks.adminCalls = [];
  mocks.mint.mockReset().mockResolvedValue({ name: "auth_tokens/abc", expireTime: "2026-10-01T10:10:00Z" });
  mocks.scoreSession.mockReset();
  mocks.analyzeGap.mockReset();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_LIVE_MODEL", "test-live-model");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/live/token", () => {
  it("refuses an anonymous full-mode token before anything else — even on a misconfigured server", async () => {
    fake = fakeSupabase({ userId: null });
    vi.stubEnv("GEMINI_API_KEY", "");
    const res = await mintToken(jsonRequest("http://x", "POST", { mode: "full" }));
    expect(res.status).toBe(401);
    expect(mocks.mint).not.toHaveBeenCalled();
  });

  it("refuses the smoke test (no stage) in production unless explicitly enabled", async () => {
    fake = fakeSupabase({ respond: database(true) });
    vi.stubEnv("NODE_ENV", "production");
    const res = await mintToken(jsonRequest("http://x", "POST", { mode: "full" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "smoke_test_disabled" });
    expect(consumed(fake.ops)).toEqual([]);
    expect(mocks.mint).not.toHaveBeenCalled();
  });

  it("allows the smoke test in production with ENABLE_VOICE_SMOKE_TEST=1, counted as an interview", async () => {
    fake = fakeSupabase({ respond: database(true) });
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_VOICE_SMOKE_TEST", "1");
    const res = await mintToken(jsonRequest("http://x", "POST", { mode: "full" }));
    expect(res.status).toBe(200);
    expect(consumed(fake.ops)).toEqual([{ p_kind: "interview_token", p_max: 10 }]);
  });

  it("mints a stage interview under the daily limit", async () => {
    fake = fakeSupabase({ respond: database(true) });
    const res = await mintToken(jsonRequest("http://x", "POST", { mode: "full", stageId: STAGE_ID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ token: "auth_tokens/abc", model: "test-live-model" });
    expect(consumed(fake.ops)).toEqual([{ p_kind: "interview_token", p_max: 10 }]);
  });

  it("counts a drill against the drill limit", async () => {
    fake = fakeSupabase({ respond: database(true) });
    await mintToken(jsonRequest("http://x", "POST", { mode: "full", stageId: STAGE_ID, drill: true, questionIndex: 0 }));
    expect(consumed(fake.ops)).toEqual([{ p_kind: "drill_token", p_max: 20 }]);
  });

  it("refuses at the daily limit without minting", async () => {
    fake = fakeSupabase({ respond: database(false) });
    const res = await mintToken(jsonRequest("http://x", "POST", { mode: "full", stageId: STAGE_ID }));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "daily_limit", kind: "interview_token", limit: 10 });
    expect(mocks.mint).not.toHaveBeenCalled();
  });

  it("fails closed when the limit can't be checked", async () => {
    fake = fakeSupabase({ respond: database("error") });
    const res = await mintToken(jsonRequest("http://x", "POST", { mode: "full", stageId: STAGE_ID }));
    expect(res.status).toBe(503);
    expect(mocks.mint).not.toHaveBeenCalled();
  });

  it("doesn't spend the allowance on a locked stage", async () => {
    fake = fakeSupabase({
      respond: database(true, (op) => (op.table === "progress" ? { data: { unlocked: false } } : undefined)),
    });
    const res = await mintToken(jsonRequest("http://x", "POST", { mode: "full", stageId: STAGE_ID }));
    expect(res.status).toBe(403);
    expect(consumed(fake.ops)).toEqual([]);
  });

  it("gives the unit back when minting fails", async () => {
    fake = fakeSupabase({ respond: database(true) });
    mocks.mint.mockRejectedValue(new Error("upstream down"));
    const res = await mintToken(jsonRequest("http://x", "POST", { mode: "full", stageId: STAGE_ID }));
    expect(res.status).toBe(502);
    expect(mocks.adminCalls).toEqual([["release_user_quota", { p_user: "user-1", p_kind: "interview_token" }]]);
  });
});

describe("POST /api/sessions/[id]/score", () => {
  const scoringDatabase = (allowed: boolean, extra: (op: Op) => Result | undefined = () => undefined) =>
    database(allowed, (op) => {
      const scripted = extra(op);
      if (scripted) return scripted;
      if (op.table === "sessions") {
        return { data: { id: SESSION_ID, stage_id: STAGE_ID, language: "en", duration_seconds: 300, usage: null } };
      }
      if (op.table === "roadmaps") return { data: { gap_analysis: GAP_ANALYSIS } };
      if (op.table === "scorecards" && op.action === "select") return { data: null };
      if (op.table === "turns") {
        return { data: [{ role: "candidate", transcript: "I built it.", start_ms: 0, end_ms: 2000 }] };
      }
      return undefined;
    });

  const score = () => scoreRoute(new Request("http://x", { method: "POST" }), routeContext({ id: SESSION_ID }));

  it("returns an existing scorecard without spending anything", async () => {
    fake = fakeSupabase({
      respond: scoringDatabase(true, (op) =>
        op.table === "scorecards" && op.action === "select" ? { data: { id: "sc-1" } } : undefined,
      ),
    });
    const res = await score();
    expect(await res.json()).toEqual({ scorecardId: "sc-1", alreadyScored: true });
    expect(consumed(fake.ops)).toEqual([]);
    expect(mocks.scoreSession).not.toHaveBeenCalled();
  });

  it("refuses at the daily limit before calling the model", async () => {
    fake = fakeSupabase({ respond: scoringDatabase(false) });
    const res = await score();
    expect(res.status).toBe(429);
    expect(mocks.scoreSession).not.toHaveBeenCalled();
  });

  it("gives the unit back when every model is overloaded", async () => {
    fake = fakeSupabase({ respond: scoringDatabase(true) });
    mocks.scoreSession.mockRejectedValue(new ApiError({ message: "high demand", status: 503 }));
    const res = await score();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "model_busy" });
    expect(mocks.adminCalls).toEqual([["release_user_quota", { p_user: "user-1", p_kind: "scoring" }]]);
  });

  it("says when the model's quota (not the user's) is gone, and gives the unit back", async () => {
    fake = fakeSupabase({ respond: scoringDatabase(true) });
    mocks.scoreSession.mockRejectedValue(new ApiError({ message: "quota", status: 429 }));
    const res = await score();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "quota_exceeded" });
    expect(mocks.adminCalls).toHaveLength(1);
  });

  it("keeps the unit when the failure could have been caused by the input", async () => {
    fake = fakeSupabase({ respond: scoringDatabase(true) });
    mocks.scoreSession.mockRejectedValue(new ApiError({ message: "invalid argument", status: 400 }));
    await score();
    expect(mocks.adminCalls).toEqual([]);
  });
});

describe("POST /api/analyze", () => {
  const PDF = "%PDF-1.4\n%fake but well-formed enough\n";
  const JD = "We are hiring a Python developer to build retrieval-augmented generation systems.";

  function analyzeRequest(cv: string, headers: Record<string, string> = {}, consent: string | null = CONSENT_VERSION) {
    const form = new FormData();
    form.set("cv", new File([cv], "cv.pdf", { type: "application/pdf" }));
    form.set("jd", JD);
    form.set("language", "en");
    if (consent !== null) form.set("consent", consent);
    return new Request("http://x", { method: "POST", body: form, headers });
  }

  const analysisDatabase = (allowed: boolean) =>
    database(allowed, (op) => {
      if (op.table === "documents" && op.action === "insert") return { data: { id: "doc-1" } };
      return undefined;
    });

  it.each([
    ["missing", null],
    ["for an older wording", "2020-01-01"],
  ])("refuses without consent (%s), before storing or spending anything", async (_label, consent) => {
    fake = fakeSupabase({ respond: analysisDatabase(true) });
    const res = await analyzeRoute(analyzeRequest(PDF, {}, consent));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "consent_required" });
    expect(fake.ops).toEqual([]);
  });

  it("records which wording was agreed to, and when, before processing", async () => {
    fake = fakeSupabase({ respond: analysisDatabase(false) });
    await analyzeRoute(analyzeRequest(PDF));
    const consent = fake.ops.find((op) => op.table === "profiles" && op.action === "update");
    expect(consent?.payload).toMatchObject({ ai_processing_consent_version: CONSENT_VERSION });
    expect(consent?.filters).toContainEqual(["eq", "id", "user-1"]);
    expect(fake.ops.indexOf(consent!)).toBeLessThan(fake.ops.findIndex((op) => op.table === "rpc:consume_user_quota"));
  });

  it("refuses a file that only claims to be a PDF, without spending the allowance", async () => {
    fake = fakeSupabase({ respond: analysisDatabase(true) });
    const res = await analyzeRoute(analyzeRequest("MZ\x90\x00 not a pdf"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "cv_must_be_pdf" });
    expect(consumed(fake.ops)).toEqual([]);
  });

  it("refuses an oversized request before reading it", async () => {
    fake = fakeSupabase({ respond: analysisDatabase(true) });
    const res = await analyzeRoute(analyzeRequest(PDF, { "content-length": String(50 * 1024 * 1024) }));
    expect(res.status).toBe(413);
    expect(fake.ops.filter((op) => op.table !== "rpc:consume_user_quota")).toEqual([]);
  });

  it("refuses at the daily limit before storing anything", async () => {
    fake = fakeSupabase({ respond: analysisDatabase(false) });
    const res = await analyzeRoute(analyzeRequest(PDF));
    expect(res.status).toBe(429);
    expect(fake.ops.some((op) => op.action === "storage")).toBe(false);
    expect(mocks.analyzeGap).not.toHaveBeenCalled();
  });

  it("gives the unit back when Gemini is overloaded", async () => {
    fake = fakeSupabase({ respond: analysisDatabase(true) });
    mocks.analyzeGap.mockRejectedValue(new ApiError({ message: "high demand", status: 503 }));
    const res = await analyzeRoute(analyzeRequest(PDF));
    expect(res.status).toBe(503);
    expect(mocks.adminCalls).toEqual([["release_user_quota", { p_user: "user-1", p_kind: "analysis" }]]);
  });

  it("keeps the unit when the model rejects the input (no free retries with crafted files)", async () => {
    fake = fakeSupabase({ respond: analysisDatabase(true) });
    mocks.analyzeGap.mockRejectedValue(new ApiError({ message: "bad pdf", status: 400 }));
    const res = await analyzeRoute(analyzeRequest(PDF));
    expect(res.status).toBe(502);
    expect(mocks.adminCalls).toEqual([]);
  });
});

describe("POST /api/sessions", () => {
  it("refuses at the daily limit without creating a row", async () => {
    fake = fakeSupabase({ respond: database(false) });
    const res = await createSession(jsonRequest("http://x", "POST", { stageId: STAGE_ID }));
    expect(res.status).toBe(429);
    expect(fake.ops.some((op) => op.table === "sessions" && op.action === "insert")).toBe(false);
  });
});

describe("PATCH /api/sessions/[id] input limits", () => {
  const patch = (body: unknown, headers: Record<string, string> = {}) =>
    flushTurns(
      new Request("http://x", { method: "PATCH", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }),
      routeContext({ id: SESSION_ID }),
    );
  const turn = (transcript = "hello") => ({ role: "candidate", transcript, start_ms: 0, end_ms: 1000 });

  it("refuses more turns than any interview produces", async () => {
    fake = fakeSupabase();
    const res = await patch({ turns: Array.from({ length: 501 }, () => turn()) });
    expect(res.status).toBe(400);
    expect(fake.ops).toEqual([]);
  });

  it("refuses a megabyte-sized transcript", async () => {
    fake = fakeSupabase();
    const res = await patch({ turns: [turn("x".repeat(20_001))] });
    expect(res.status).toBe(400);
  });

  it("refuses non-finite timings but accepts odd finite ones", async () => {
    fake = fakeSupabase({ respond: (op) => (op.table === "sessions" ? { data: { id: SESSION_ID, started_at: "2026-10-01T10:00:00Z" } } : undefined) });
    const bad = await flushTurns(
      new Request("http://x", { method: "PATCH", body: '{"turns":[{"role":"candidate","transcript":"a","start_ms":1e999,"end_ms":0}]}' }),
      routeContext({ id: SESSION_ID }),
    );
    expect(bad.status).toBe(400);
    const odd = await patch({ turns: [{ ...turn(), start_ms: -3, end_ms: -1 }] });
    expect(odd.status).toBe(200);
  });

  it("refuses an oversized body before parsing it", async () => {
    fake = fakeSupabase();
    const res = await patch({ turns: [] }, { "content-length": String(3 * 1024 * 1024) });
    expect(res.status).toBe(413);
  });
});

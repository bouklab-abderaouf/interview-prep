import { describe, expect, it, vi } from "vitest";

import { analyzeGap } from "@/lib/gemini/analyze-gap";
import { FAKE_GAP_ANALYSIS, fakeScorecard, geminiIsFaked } from "@/lib/gemini/fake";
import { GapAnalysis, Scorecard } from "@/lib/gemini/schemas";
import { scoreSession } from "@/lib/gemini/score-session";

describe("geminiIsFaked", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"])(
    "is on with GEMINI_FAKE=1 and a local Supabase (%s)",
    (url) => {
      vi.stubEnv("GEMINI_FAKE", "1");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
      expect(geminiIsFaked()).toBe(true);
    },
  );

  it("is ignored against a real Supabase project, even with GEMINI_FAKE=1 (production can't be faked)", () => {
    vi.stubEnv("GEMINI_FAKE", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ffvchknczxsitjwnbdcr.supabase.co");
    expect(geminiIsFaked()).toBe(false);
  });

  it("is off without GEMINI_FAKE, or with a malformed URL", () => {
    vi.stubEnv("GEMINI_FAKE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    expect(geminiIsFaked()).toBe(false);
    vi.stubEnv("GEMINI_FAKE", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not a url");
    expect(geminiIsFaked()).toBe(false);
  });
});

describe("fake results", () => {
  it("are valid against the real schemas", () => {
    expect(() => GapAnalysis.parse(FAKE_GAP_ANALYSIS)).not.toThrow();
    expect(() => Scorecard.parse(fakeScorecard(["I built a RAG pipeline."]))).not.toThrow();
  });

  it("quote the transcript verbatim, as the real strengths check requires", () => {
    expect(fakeScorecard(["", "I built a RAG pipeline."]).strengths[0].quote_from_answer).toBe("I built a RAG pipeline.");
  });
});

describe("wired into the real calls", () => {
  const metrics = { pace_wpm: 130, filler_rate: 1, talk_ratio: 0.6, longest_pause_ms: 800, avg_answer_seconds: 30, answer_length_variance: 5 };

  it("short-circuits analysis and scoring locally, without an API key", async () => {
    vi.stubEnv("GEMINI_FAKE", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(analyzeGap({ cvBytes: Buffer.from("%PDF-"), jdText: "x", language: "en" })).resolves.toBe(FAKE_GAP_ANALYSIS);
    const scorecard = await scoreSession({
      turns: [{ role: "candidate", transcript: "I built it.", start_ms: 0, end_ms: 1000 }],
      focusAreas: [],
      questionBank: [],
      gaps: [],
      candidate: { top_skills: [], notable_projects: [] },
      metrics,
      language: "en",
    });
    expect(scorecard.overall).toBe(72);
  });

  it("takes the real path against a real project (and so needs the API key)", async () => {
    vi.stubEnv("GEMINI_FAKE", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ffvchknczxsitjwnbdcr.supabase.co");
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(analyzeGap({ cvBytes: Buffer.from("%PDF-real"), jdText: "y", language: "en" })).rejects.toThrow(
      "GEMINI_API_KEY not configured",
    );
  });
});

import { describe, expect, it, vi } from "vitest";

import { isLinkError, LINK_ERRORS } from "@/components/auth/link-errors";
import { downsampleLinear, float32ToInt16 } from "@/lib/audio/resample";
import { formatDate, formatDateTime, formatDuration } from "@/lib/format";
import { getClientIp, hashIp } from "@/lib/guardrails/rate-limit";
import { buildInterviewerPrompt, type StageContext } from "@/lib/prompts/interviewer";

// rate-limit.ts imports the service-role client at module load; nothing here
// calls it, but keep the import from needing real credentials.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

describe("format", () => {
  it("formats dates in UTC so server and client agree", () => {
    // 23:30 UTC is already the next day in Paris — must still say the 30th.
    expect(formatDate("2026-09-30T23:30:00Z")).toBe("30 Sept 2026");
    expect(formatDateTime("2026-09-30T23:30:00Z")).toBe("30 Sept 2026, 23:30");
    expect(formatDate(null)).toBe("—");
  });

  it.each([
    [null, "—"],
    [-1, "—"],
    [0, "0s"],
    [45, "45s"],
    [60, "1m"],
    [399, "6m 39s"],
    [3_660, "1h 1m"],
  ])("formatDuration(%s) → %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe("audio resampling", () => {
  it("passes through when rates match", () => {
    const input = new Float32Array([0.1, 0.2]);
    expect(downsampleLinear(input, 16_000, 16_000)).toBe(input);
  });

  it("downsamples 48k → 16k to a third of the length, interpolating", () => {
    const input = Float32Array.from({ length: 48 }, (_, i) => i / 48);
    const output = downsampleLinear(input, 48_000, 16_000);
    expect(output).toHaveLength(16);
    expect(output[1]).toBeCloseTo(3 / 48);
  });

  it("clamps and scales to PCM16 without overflowing", () => {
    expect(Array.from(float32ToInt16(new Float32Array([-2, -1, 0, 1, 2])))).toEqual([
      -32768, -32768, 0, 32767, 32767,
    ]);
  });
});

describe("guardrail helpers", () => {
  it("takes the first X-Forwarded-For hop as the client IP", () => {
    const request = new Request("http://x", { headers: { "x-forwarded-for": " 1.2.3.4 , 10.0.0.1" } });
    expect(getClientIp(request)).toBe("1.2.3.4");
  });

  it("falls back to X-Real-IP, then 'unknown'", () => {
    expect(getClientIp(new Request("http://x", { headers: { "x-real-ip": "5.6.7.8" } }))).toBe("5.6.7.8");
    expect(getClientIp(new Request("http://x"))).toBe("unknown");
  });

  it("trusts only the header CLIENT_IP_HEADER names, when set", () => {
    const headers = { "x-forwarded-for": "6.6.6.6, 9.9.9.9", "cf-connecting-ip": "9.9.9.9" };
    expect(getClientIp(new Request("http://x", { headers }))).toBe("6.6.6.6");
    vi.stubEnv("CLIENT_IP_HEADER", "cf-connecting-ip");
    expect(getClientIp(new Request("http://x", { headers }))).toBe("9.9.9.9");
    // Missing on a request (e.g. a local health check): the usual fallbacks.
    expect(getClientIp(new Request("http://x", { headers: { "x-real-ip": "5.6.7.8" } }))).toBe("5.6.7.8");
    vi.unstubAllEnvs();
  });

  it("hashes IPs with the salt so raw IPs are never stored", () => {
    vi.stubEnv("IP_HASH_SALT", "salt-a");
    const a = hashIp("1.2.3.4");
    vi.stubEnv("IP_HASH_SALT", "salt-b");
    expect(hashIp("1.2.3.4")).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("1.2.3.4");
  });
});

describe("sign-in link errors", () => {
  it("accepts only known reasons", () => {
    for (const reason of Object.keys(LINK_ERRORS)) expect(isLinkError(reason)).toBe(true);
    expect(isLinkError("bogus")).toBe(false);
    expect(isLinkError("toString")).toBe(false);
    expect(isLinkError(undefined)).toBe(false);
  });
});

describe("buildInterviewerPrompt", () => {
  const stage: StageContext = {
    title: "Tech screen",
    focusAreas: ["RAG", "Python"],
    persona: { name: "Claire Martin", role: "Lead engineer", tone: "skeptical", strictness: 4 },
    questionBank: [
      { text: "Walk me through your last project.", targets: "intro", follow_ups: ["What did you own?"] },
      { text: "Why the gap in 2023?", targets: "gap", follow_ups: [] },
    ],
  };

  it.each(["fr", "en"] as const)("always forbids claiming to be human (%s, EU AI Act Art. 50)", (language) => {
    for (const prompt of [
      buildInterviewerPrompt({ mode: "demo", language }),
      buildInterviewerPrompt({ mode: "full", language, stageContext: stage }),
      buildInterviewerPrompt({
        mode: "full",
        language,
        stageContext: { ...stage, drill: { targetQuestion: "Q?", targets: "t", followUps: [] } },
      }),
    ]) {
      expect(prompt).toMatch(language === "fr" ? /ne prétends jamais être humain/ : /never claim to be human/);
    }
  });

  it("includes the question bank and follow-ups for a full interview", () => {
    const prompt = buildInterviewerPrompt({ mode: "full", language: "en", stageContext: stage });
    expect(prompt).toContain("Walk me through your last project. (follow-ups: What did you own?)");
    expect(prompt).toContain("Claire Martin");
    expect(prompt).toContain("Never open with one.");
  });

  it("uses the drill arc and leaves the question bank out of a drill", () => {
    const prompt = buildInterviewerPrompt({
      mode: "full",
      language: "en",
      stageContext: {
        ...stage,
        drill: { targetQuestion: "Why the gap in 2023?", targets: "gap", followUps: ["Be specific."] },
      },
    });
    expect(prompt).toContain("TARGETED DRILL");
    expect(prompt).toContain('"Why the gap in 2023?"');
    expect(prompt).toContain("Be specific.");
    expect(prompt).not.toContain("Walk me through your last project.");
    expect(prompt).not.toContain("Run this like a real conversation");
  });

  it("answers in the session language", () => {
    expect(buildInterviewerPrompt({ mode: "demo", language: "fr" })).toContain("Réponds toujours en français.");
    expect(buildInterviewerPrompt({ mode: "demo", language: "en" })).toContain("Always respond in English.");
  });
});

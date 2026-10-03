import { beforeEach, describe, expect, it, vi } from "vitest";

import { describeLimitRefusal } from "@/lib/limit-messages";
import { fakeSupabase } from "@/tests/helpers/fake-supabase";

const admin = vi.hoisted(() => ({ calls: [] as Array<[string, unknown]>, fail: false }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      admin.calls.push([fn, args]);
      return { data: null, error: admin.fail ? { message: "boom" } : null };
    },
  }),
}));

const { consumeDailyQuota, dailyLimit, nextUtcMidnight, quotaRefusal, releaseDailyQuota } = await import(
  "@/lib/limits"
);

describe("dailyLimit", () => {
  it("uses the provisional default when no env override is set", () => {
    vi.stubEnv("USER_MAX_ANALYSES_PER_DAY", undefined);
    expect(dailyLimit("analysis")).toBe(3);
  });

  it("takes a whole, non-negative env override, including 0 to switch a kind off", () => {
    vi.stubEnv("USER_MAX_ANALYSES_PER_DAY", "7");
    expect(dailyLimit("analysis")).toBe(7);
    vi.stubEnv("USER_MAX_ANALYSES_PER_DAY", "0");
    expect(dailyLimit("analysis")).toBe(0);
  });

  it.each(["", " ", "-1", "2.5", "lots"])("ignores an invalid override (%j)", (value) => {
    vi.stubEnv("USER_MAX_SCORINGS_PER_DAY", value);
    expect(dailyLimit("scoring")).toBe(15);
  });
});

describe("nextUtcMidnight", () => {
  it("is the next 00:00 UTC, across month ends", () => {
    expect(nextUtcMidnight(new Date("2026-10-01T21:30:00Z"))).toBe("2026-10-02T00:00:00.000Z");
    expect(nextUtcMidnight(new Date("2026-09-30T23:59:59Z"))).toBe("2026-10-01T00:00:00.000Z");
    expect(nextUtcMidnight(new Date("2026-12-31T00:00:00Z"))).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("consumeDailyQuota", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("asks the database for one unit with the configured limit", async () => {
    const { client, ops } = fakeSupabase({ respond: () => ({ data: true }) });
    await expect(consumeDailyQuota(client, "interview_token")).resolves.toEqual({ allowed: true });
    expect(ops).toEqual([
      expect.objectContaining({ table: "rpc:consume_user_quota", payload: { p_kind: "interview_token", p_max: 10 } }),
    ]);
  });

  it("refuses with the limit and reset time when the database says no", async () => {
    const { client } = fakeSupabase({ respond: () => ({ data: false }) });
    await expect(consumeDailyQuota(client, "analysis", new Date("2026-10-01T09:00:00Z"))).resolves.toEqual({
      allowed: false,
      reason: "daily_limit",
      kind: "analysis",
      limit: 3,
      resetsAt: "2026-10-02T00:00:00.000Z",
    });
  });

  it("fails closed when the counter can't be reached", async () => {
    const { client } = fakeSupabase({ respond: () => ({ error: { message: "function does not exist" } }) });
    await expect(consumeDailyQuota(client, "scoring")).resolves.toEqual({
      allowed: false,
      reason: "limits_unavailable",
      kind: "scoring",
    });
  });
});

describe("releaseDailyQuota", () => {
  beforeEach(() => {
    admin.calls = [];
    admin.fail = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("gives one unit back through the service-role-only function", async () => {
    await releaseDailyQuota("user-1", "analysis");
    expect(admin.calls).toEqual([["release_user_quota", { p_user: "user-1", p_kind: "analysis" }]]);
  });

  it("never throws: a lost refund costs the user one unit, not the request", async () => {
    admin.fail = true;
    await expect(releaseDailyQuota("user-1", "analysis")).resolves.toBeUndefined();
  });
});

describe("quotaRefusal", () => {
  it("is a 429 with everything the UI needs for a daily limit", async () => {
    const res = quotaRefusal({
      allowed: false,
      reason: "daily_limit",
      kind: "drill_token",
      limit: 20,
      resetsAt: "2026-10-02T00:00:00.000Z",
    });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "daily_limit",
      kind: "drill_token",
      limit: 20,
      resetsAt: "2026-10-02T00:00:00.000Z",
    });
  });

  it("is a 503 when the limits can't be checked", async () => {
    const res = quotaRefusal({ allowed: false, reason: "limits_unavailable", kind: "scoring" });
    expect(res.status).toBe(503);
  });
});

describe("describeLimitRefusal", () => {
  it("says which limit and when it resets, in the viewer's zone", () => {
    const body = { error: "daily_limit", kind: "analysis", limit: 3, resetsAt: "2026-10-02T00:00:00.000Z" };
    expect(describeLimitRefusal(body, "UTC")).toBe("You've reached today's limit of 3 CV analyses. It resets at 00:00.");
    expect(describeLimitRefusal(body, "Europe/Paris")).toBe(
      "You've reached today's limit of 3 CV analyses. It resets at 02:00.",
    );
  });

  it("explains an unavailable limit check", () => {
    expect(describeLimitRefusal({ error: "limits_unavailable" })).toMatch(/can't be checked/);
  });

  it("ignores anything else", () => {
    expect(describeLimitRefusal({ error: "scoring_failed" })).toBeNull();
    expect(describeLimitRefusal(null)).toBeNull();
    expect(describeLimitRefusal("daily_limit")).toBeNull();
  });
});

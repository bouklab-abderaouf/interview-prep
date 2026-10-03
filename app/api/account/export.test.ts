import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type Op, type Result } from "@/tests/helpers/fake-supabase";

let fake = fakeSupabase();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));

const { GET } = await import("@/app/api/account/export/route");

const ROWS: Record<string, unknown> = {
  profiles: { id: "user-1", total_xp: 316, ai_processing_consent_version: "2026-10-01" },
  documents: [
    { id: "cv-1", kind: "cv", storage_path: "user-1/cv-1.pdf" },
    { id: "jd-1", kind: "jd", storage_path: null, raw_text: "Python developer…" },
  ],
  roadmaps: [{ id: "r1", target_role: "Développeur IA" }],
  progress: [{ stage_id: "st1", unlocked: true }],
  sessions: [{ id: "s1", stage_id: "st1" }],
  user_daily_usage: [{ day: "2026-10-01", kind: "analysis", count: 1 }],
  stages: [{ id: "st1", roadmap_id: "r1" }],
  turns: [{ session_id: "s1", role: "candidate", transcript: "I built a RAG system." }],
  scorecards: [{ session_id: "s1", overall: 65 }],
};

function database(overrides: (op: Op) => Result | undefined = () => undefined) {
  return (op: Op): Result | undefined => {
    const scripted = overrides(op);
    if (scripted) return scripted;
    if (op.action === "storage") return { data: { signedUrl: "https://storage.example/signed?token=t" } };
    return { data: ROWS[op.table] ?? null };
  };
}

describe("GET /api/account/export", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("refuses anonymous callers", async () => {
    fake = fakeSupabase({ userId: null });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(fake.ops).toEqual([]);
  });

  it("returns everything held about the user as a JSON download", async () => {
    fake = fakeSupabase({ respond: database() });
    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="interview-prep-export-\d{4}-\d{2}-\d{2}\.json"/);
    expect(res.headers.get("cache-control")).toBe("no-store");

    const body = await res.json();
    expect(body).toMatchObject({
      format: "interview-prep-export/1",
      account: { id: "user-1", email: "user-1@example.com" },
      profile: ROWS.profiles,
      documents: ROWS.documents,
      roadmaps: ROWS.roadmaps,
      stages: ROWS.stages,
      progress: ROWS.progress,
      sessions: ROWS.sessions,
      turns: ROWS.turns,
      scorecards: ROWS.scorecards,
      daily_usage: ROWS.user_daily_usage,
    });
    // CVs as short-lived links, only for documents that have a file.
    expect(body.cv_files).toEqual([
      { document_id: "cv-1", download_url: "https://storage.example/signed?token=t", expires_in_seconds: 3600 },
    ]);
  });

  it("scopes every query to the caller", async () => {
    fake = fakeSupabase({ respond: database() });
    await GET();
    for (const table of ["documents", "roadmaps", "progress", "sessions", "user_daily_usage"]) {
      const op = fake.ops.find((o) => o.table === table)!;
      expect(op.filters, table).toContainEqual(["eq", "user_id", "user-1"]);
    }
    expect(fake.ops.find((o) => o.table === "profiles")!.filters).toContainEqual(["eq", "id", "user-1"]);
    expect(fake.ops.find((o) => o.table === "turns")!.filters).toContainEqual(["in", "session_id", ["s1"]]);
  });

  it("never returns a partial export", async () => {
    fake = fakeSupabase({ respond: database((op) => (op.table === "turns" ? { error: { message: "timeout" } } : undefined)) });
    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "export_failed" });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type Op, type Result } from "@/tests/helpers/fake-supabase";

let admin = fakeSupabase({ userId: null });
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.client }));
vi.mock("@/lib/monitoring/events", () => ({ reportEvent: vi.fn() }));

const { GET } = await import("@/app/api/cron/retention/route");
const { sweepOrphanCvs } = await import("@/lib/retention");

const NOW = Date.parse("2026-10-02T03:17:00Z");
const OLD = "2026-09-20T10:00:00Z";
const FRESH = "2026-10-02T03:00:00Z";

/** A bucket with two user folders; `documents` knows only some of the files. */
function bucket(knownPaths: string[], extra: (op: Op) => Result | undefined = () => undefined) {
  return (op: Op): Result | undefined => {
    const scripted = extra(op);
    if (scripted) return scripted;
    if (op.table === "rpc:run_retention") return { data: { demo_sessions: 2, usage_rows: 5 } };
    if (op.action === "storage" && op.columns === "list") {
      const [path] = op.payload as [string];
      if (path === "") return { data: [{ name: "user-a" }, { name: "user-b" }] };
      if (path === "user-a") {
        return {
          data: [
            { name: "kept.pdf", created_at: OLD },
            { name: "orphan.pdf", created_at: OLD },
            { name: "uploading.pdf", created_at: FRESH },
          ],
        };
      }
      if (path === "user-b") return { data: [{ name: "deleted-account-leftover.pdf", created_at: OLD }] };
    }
    if (op.table === "documents") {
      const [, , paths] = op.filters.find(([kind]) => kind === "in")!;
      return { data: (paths as string[]).filter((p) => knownPaths.includes(p)).map((storage_path) => ({ storage_path })) };
    }
    return undefined;
  };
}

const cron = (authorization?: string) =>
  GET(new Request("http://x/api/cron/retention", { headers: authorization ? { authorization } : {} }));

describe("sweepOrphanCvs", () => {
  it("removes old files with no documents row, and nothing else", async () => {
    admin = fakeSupabase({ userId: null, respond: bucket(["user-a/kept.pdf"]) });
    const removed = await sweepOrphanCvs(admin.client as never, NOW);

    expect(removed).toBe(2);
    const removeOp = admin.ops.find((op) => op.action === "storage" && op.columns === "remove")!;
    expect(removeOp.payload).toEqual([["user-a/orphan.pdf", "user-b/deleted-account-leftover.pdf"]]);
  });

  it("never touches a file younger than a day (an upload in progress)", async () => {
    admin = fakeSupabase({ userId: null, respond: bucket([]) });
    await sweepOrphanCvs(admin.client as never, NOW);
    const removeOp = admin.ops.find((op) => op.columns === "remove")!;
    expect(removeOp.payload).not.toContainEqual(expect.arrayContaining(["user-a/uploading.pdf"]));
  });

  it("does nothing when every file is accounted for", async () => {
    admin = fakeSupabase({
      userId: null,
      respond: bucket(["user-a/kept.pdf", "user-a/orphan.pdf", "user-b/deleted-account-leftover.pdf"]),
    });
    expect(await sweepOrphanCvs(admin.client as never, NOW)).toBe(0);
    expect(admin.ops.some((op) => op.columns === "remove")).toBe(false);
  });
});

describe("GET /api/cron/retention", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    // The route reads the real clock; pin it to the fixtures' "now", or the
    // "fresh" file stops being fresh a day after this test was written.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays closed until CRON_SECRET is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    admin = fakeSupabase({ userId: null, respond: bucket([]) });
    expect((await cron("Bearer anything")).status).toBe(503);
    expect(admin.ops).toEqual([]);
  });

  it.each([undefined, "Bearer wrong", "Bearer s3cret-but-longer", "s3cret"])("refuses %s", async (authorization) => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    admin = fakeSupabase({ userId: null, respond: bucket([]) });
    expect((await cron(authorization)).status).toBe(401);
    expect(admin.ops).toEqual([]);
  });

  it("runs the database retention and the storage sweep, and reports counts", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    admin = fakeSupabase({ userId: null, respond: bucket(["user-a/kept.pdf"]) });
    const res = await cron("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, demo_sessions: 2, usage_rows: 5, orphan_cvs: 2 });
  });

  it("reports a failure instead of half-succeeding silently", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    admin = fakeSupabase({
      userId: null,
      respond: bucket([], (op) => (op.table === "rpc:run_retention" ? { error: { message: "boom" } } : undefined)),
    });
    const res = await cron("Bearer s3cret");
    expect(res.status).toBe(502);
    const { reportEvent } = await import("@/lib/monitoring/events");
    expect(reportEvent).toHaveBeenCalledWith("cron.retention_failed");
  });
});

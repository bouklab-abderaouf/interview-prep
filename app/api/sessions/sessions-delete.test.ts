import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, jsonRequest, routeContext, type Op, type Result } from "@/tests/helpers/fake-supabase";

let fake = fakeSupabase();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));

const { DELETE: deleteOne } = await import("@/app/api/sessions/[id]/route");
const { DELETE: deleteMany } = await import("@/app/api/sessions/route");

const ID_A = "5f0c6d2e-1b7a-4c3e-9a51-0d9a8b7c6e5f";
const ID_B = "8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function setup(options: { userId?: string | null; respond?: (op: Op) => Result | undefined } = {}) {
  fake = fakeSupabase(options);
  return fake;
}

describe("DELETE /api/sessions/[id]", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects anonymous requests without touching the database", async () => {
    const { ops } = setup({ userId: null });
    const res = await deleteOne(new Request("http://x", { method: "DELETE" }), routeContext({ id: ID_A }));
    expect(res.status).toBe(401);
    expect(ops).toEqual([]);
  });

  it("deletes only the caller's own session", async () => {
    const { ops } = setup({ respond: () => ({ data: [{ id: ID_A }] }) });
    const res = await deleteOne(new Request("http://x", { method: "DELETE" }), routeContext({ id: ID_A }));

    expect(res.status).toBe(200);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ table: "sessions", action: "delete" });
    expect(ops[0].filters).toEqual(
      expect.arrayContaining([
        ["eq", "id", ID_A],
        ["eq", "user_id", "user-1"],
      ]),
    );
  });

  it("returns 404 when nothing was deleted (missing, or someone else's)", async () => {
    setup({ respond: () => ({ data: [] }) });
    const res = await deleteOne(new Request("http://x", { method: "DELETE" }), routeContext({ id: ID_A }));
    expect(res.status).toBe(404);
  });

  it("returns 502 when the database errors", async () => {
    setup({ respond: () => ({ error: { message: "boom", code: "XX000" } }) });
    const res = await deleteOne(new Request("http://x", { method: "DELETE" }), routeContext({ id: ID_A }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "delete_failed" });
  });
});

describe("DELETE /api/sessions (bulk)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects anonymous requests", async () => {
    const { ops } = setup({ userId: null });
    const res = await deleteMany(jsonRequest("http://x", "DELETE", { ids: [ID_A] }));
    expect(res.status).toBe(401);
    expect(ops).toEqual([]);
  });

  it.each([
    ["malformed JSON", "{nope"],
    ["an empty list", { ids: [] }],
    ["non-uuid ids", { ids: ["1; drop table sessions"] }],
    ["a missing ids field", {}],
  ])("rejects %s", async (_label, body) => {
    const { ops } = setup();
    const res = await deleteMany(jsonRequest("http://x", "DELETE", body));
    expect(res.status).toBe(400);
    expect(ops).toEqual([]);
  });

  it("deletes the listed sessions scoped to the caller and reports the count", async () => {
    const { ops } = setup({ respond: () => ({ data: [{ id: ID_A }] }) });
    const res = await deleteMany(jsonRequest("http://x", "DELETE", { ids: [ID_A, ID_B] }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 1 });
    expect(ops[0]).toMatchObject({ table: "sessions", action: "delete" });
    expect(ops[0].filters).toEqual(
      expect.arrayContaining([
        ["in", "id", [ID_A, ID_B]],
        ["eq", "user_id", "user-1"],
      ]),
    );
  });

  it("refuses more than 200 ids in one request", async () => {
    setup();
    const ids = Array.from({ length: 201 }, () => ID_A);
    const res = await deleteMany(jsonRequest("http://x", "DELETE", { ids }));
    expect(res.status).toBe(400);
  });
});

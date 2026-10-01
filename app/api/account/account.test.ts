import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type Op } from "@/tests/helpers/fake-supabase";

let fake = fakeSupabase();
let admin = fakeSupabase({ userId: null });
const deleteUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ ...fake.client, auth: { ...fake.client.auth, signOut: vi.fn(async () => ({ error: null })) } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ ...admin.client, auth: { admin: { deleteUser } } }),
}));

const { DELETE } = await import("@/app/api/account/route");

const storage = (respond: (method: string) => { data?: unknown; error?: { message: string } } | undefined) => (op: Op) =>
  op.action === "storage" ? respond(op.columns!) : undefined;

describe("DELETE /api/account", () => {
  beforeEach(() => {
    deleteUser.mockReset().mockResolvedValue({ error: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("refuses anonymous callers", async () => {
    fake = fakeSupabase({ userId: null });
    expect((await DELETE()).status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("empties the user's CV folder, deletes the auth user, then their invitation", async () => {
    fake = fakeSupabase({
      userId: "user-1",
      respond: storage((method) => (method === "list" ? { data: [{ name: "a.pdf" }, { name: "b.pdf" }] } : {})),
    });
    admin = fakeSupabase({ userId: null });

    const res = await DELETE();
    expect(res.status).toBe(200);

    const removed = fake.ops.find((op) => op.columns === "remove")!;
    expect(removed.payload).toEqual([["user-1/a.pdf", "user-1/b.pdf"]]);
    expect(deleteUser).toHaveBeenCalledWith("user-1");
    // fakeSupabase gives users the email `<id>@example.com`.
    const allowlist = admin.ops.find((op) => op.table === "signup_allowlist")!;
    expect(allowlist).toMatchObject({ action: "delete", filters: [["eq", "email", "user-1@example.com"]] });
  });

  it("leaves the account intact if the CVs can't be removed (so the user can retry)", async () => {
    fake = fakeSupabase({
      userId: "user-1",
      respond: storage((method) =>
        method === "list" ? { data: [{ name: "a.pdf" }] } : { error: { message: "storage down" } },
      ),
    });
    const res = await DELETE();
    expect(res.status).toBe(502);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

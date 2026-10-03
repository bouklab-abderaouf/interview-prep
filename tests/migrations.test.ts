import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// DELETE /api/account deletes the auth user and relies on foreign keys to
// remove everything else (AGENTS.md §3.H). A new table that forgets
// `on delete cascade` back to auth.users — directly or through a parent —
// would silently survive account deletion: a GDPR erasure bug nobody would
// notice. This reads the migrations and fails if that ever happens.

// Tables not owned by a user row, so they need no cascade path:
// - usage_counters, app_settings: no personal data;
// - signup_allowlist: invited emails from before a user exists. DELETE
//   /api/account removes the user's entry explicitly (app/api/account).
const NOT_USER_DATA = new Set(["usage_counters", "app_settings", "signup_allowlist"]);

const dir = join(process.cwd(), "supabase", "migrations");
const sql = readdirSync(dir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(dir, file), "utf8").replace(/--.*$/gm, ""))
  .join("\n");

const tables = new Map<string, string>();
for (const match of sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
  tables.set(match[1], match[2]);
}

function cascadesToUser(table: string, seen = new Set<string>()): boolean {
  if (seen.has(table)) return false;
  seen.add(table);
  const body = tables.get(table) ?? "";
  for (const ref of body.matchAll(/references\s+([\w.]+)(?:\s*\([^)]*\))?\s+on delete cascade/gi)) {
    const parent = ref[1].replace(/^public\./, "");
    if (parent === "auth.users" || cascadesToUser(parent, seen)) return true;
  }
  return false;
}

describe("database migrations", () => {
  it("define the tables this check knows about", () => {
    expect([...tables.keys()]).toEqual(
      expect.arrayContaining(["profiles", "documents", "roadmaps", "sessions", "turns", "scorecards", "user_daily_usage"]),
    );
  });

  it.each([...tables.keys()].filter((t) => !NOT_USER_DATA.has(t)))(
    "%s is deleted when its user is (on delete cascade back to auth.users)",
    (table) => {
      expect(cascadesToUser(table)).toBe(true);
    },
  );

  it("enable row level security on every table", () => {
    for (const table of tables.keys()) {
      expect(sql, `${table} has RLS enabled`).toMatch(
        new RegExp(`alter table (?:public\\.)?${table}\\s+enable row level security`, "i"),
      );
    }
  });
});

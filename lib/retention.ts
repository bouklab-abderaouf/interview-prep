import type { SupabaseClient } from "@supabase/supabase-js";

// CV files with no documents row — leftovers from a cleanup that failed
// partway — removed by the daily retention job (app/api/cron/retention).
// Only files older than a day are considered, so an upload in progress
// (file written, row not yet) is never touched.

const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const PAGE = 1000;

type Admin = Pick<SupabaseClient, "storage" | "from">;

export async function sweepOrphanCvs(admin: Admin, now: number): Promise<number> {
  const bucket = admin.storage.from("cvs");

  // CVs live at <user id>/<document id>.pdf: list the user folders, then
  // each folder's files.
  const { data: folders, error: foldersError } = await bucket.list("", { limit: PAGE });
  if (foldersError) throw new Error(`list folders: ${foldersError.message}`);

  const candidates: string[] = [];
  for (const folder of folders ?? []) {
    const { data: files, error } = await bucket.list(folder.name, { limit: PAGE });
    if (error) throw new Error(`list ${folder.name}: ${error.message}`);
    for (const file of files ?? []) {
      const createdAt = file.created_at ? Date.parse(file.created_at) : now;
      if (now - createdAt >= ORPHAN_MIN_AGE_MS) candidates.push(`${folder.name}/${file.name}`);
    }
  }
  if (candidates.length === 0) return 0;

  const known = new Set<string>();
  for (let i = 0; i < candidates.length; i += 100) {
    const { data, error } = await admin
      .from("documents")
      .select("storage_path")
      .in("storage_path", candidates.slice(i, i + 100));
    if (error) throw new Error(`documents lookup: ${error.message}`);
    for (const row of (data ?? []) as Array<{ storage_path: string }>) known.add(row.storage_path);
  }

  const orphans = candidates.filter((path) => !known.has(path));
  for (let i = 0; i < orphans.length; i += 100) {
    const { error } = await bucket.remove(orphans.slice(i, i + 100));
    if (error) throw new Error(`remove orphans: ${error.message}`);
  }
  return orphans.length;
}

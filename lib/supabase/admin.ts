import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS entirely. Server-only: never import this
// from a client component or expose SUPABASE_SERVICE_ROLE_KEY as NEXT_PUBLIC_.
// Used by guardrails (usage_counters) and demo sessions (user_id = null rows
// that no anon policy can reach — see specs §3).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin client missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

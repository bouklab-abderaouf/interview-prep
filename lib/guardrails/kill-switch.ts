import { createAdminClient } from "@/lib/supabase/admin";

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface KillSwitchStatus {
  killed: boolean;
}

// specs §5.3 step 1 — checked before anything else. KILL_SWITCH_OVERRIDE is
// the manual "everything off" lever; usage_counters.killed is set
// automatically once the daily cap is hit (see rate-limit.ts).
export async function checkKillSwitch(): Promise<KillSwitchStatus> {
  if (process.env.KILL_SWITCH_OVERRIDE === "true") {
    return { killed: true };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("usage_counters")
    .select("killed")
    .eq("day", todayKey())
    .maybeSingle();

  if (error) throw error;
  return { killed: data?.killed ?? false };
}

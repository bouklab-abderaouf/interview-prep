import { createHash } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { todayKey } from "@/lib/guardrails/kill-switch";

const DEMO_MAX_SESSIONS_PER_DAY = Number(process.env.DEMO_MAX_SESSIONS_PER_DAY ?? 200);
const DEMO_MAX_SESSIONS_PER_IP_PER_HOUR = Number(process.env.DEMO_MAX_SESSIONS_PER_IP_PER_HOUR ?? 2);

// specs §3: sessions.ip_hash = sha256(ip + salt). IP_HASH_SALT isn't in the
// spec's env list verbatim but is required to compute this column.
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${ip}${process.env.IP_HASH_SALT ?? ""}`).digest("hex");
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

// specs §5.3 step 2 — global daily cap. Flips usage_counters.killed once
// today's demo_sessions hits DEMO_MAX_SESSIONS_PER_DAY, so the kill switch
// stays tripped for the rest of the day rather than flapping request to
// request.
export async function checkGlobalDailyCap(): Promise<{ exceeded: boolean }> {
  const supabase = createAdminClient();
  const day = todayKey();

  const { data, error } = await supabase
    .from("usage_counters")
    .select("demo_sessions")
    .eq("day", day)
    .maybeSingle();
  if (error) throw error;

  const demoSessions = data?.demo_sessions ?? 0;
  if (demoSessions < DEMO_MAX_SESSIONS_PER_DAY) {
    return { exceeded: false };
  }

  const { error: upsertError } = await supabase
    .from("usage_counters")
    .upsert({ day, killed: true }, { onConflict: "day" });
  if (upsertError) throw upsertError;

  return { exceeded: true };
}

// specs §5.3 step 3 — per-IP hourly cap.
export async function checkPerIpCap(ipHash: string): Promise<{ exceeded: boolean }> {
  const supabase = createAdminClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("mode", "demo")
    .gte("started_at", oneHourAgo);
  if (error) throw error;

  return { exceeded: (count ?? 0) >= DEMO_MAX_SESSIONS_PER_IP_PER_HOUR };
}

// specs §5.3 step 5 (counter half). Atomic via a DB function — see
// supabase/migrations/004_guardrail_functions.sql — so concurrent demo
// requests can't race and lose an increment.
export async function incrementDemoSessionCount(): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("increment_demo_sessions", { p_day: todayKey() });
  if (error) throw error;
}

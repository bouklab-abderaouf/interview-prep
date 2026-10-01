import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { reportEvent } from "@/lib/monitoring/events";

// Per-user daily limits on everything that spends Gemini quota, counted in
// Postgres (supabase/migrations/008_user_daily_usage.sql) so they hold
// across serverless instances. One signed-in account used to be able to burn
// the whole free-tier day for everyone.
//
// Defaults are provisional until the real per-project quota is known
// (docs/PRODUCTION_READINESS.md, phase 4); each can be overridden by env.

export type QuotaKind = "analysis" | "scoring" | "interview_token" | "drill_token" | "session_create";

const LIMITS: Record<QuotaKind, { env: string; fallback: number }> = {
  analysis: { env: "USER_MAX_ANALYSES_PER_DAY", fallback: 3 },
  scoring: { env: "USER_MAX_SCORINGS_PER_DAY", fallback: 15 },
  interview_token: { env: "USER_MAX_INTERVIEWS_PER_DAY", fallback: 10 },
  drill_token: { env: "USER_MAX_DRILLS_PER_DAY", fallback: 20 },
  session_create: { env: "USER_MAX_SESSIONS_PER_DAY", fallback: 40 },
};

export function dailyLimit(kind: QuotaKind): number {
  const { env, fallback } = LIMITS[kind];
  const raw = process.env[env];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

/** Limits reset at 00:00 UTC (the `day` column is the UTC date). */
export function nextUtcMidnight(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

export type QuotaResult =
  | { allowed: true }
  | { allowed: false; reason: "daily_limit"; kind: QuotaKind; limit: number; resetsAt: string }
  // The counter couldn't be read or written. Fails closed: an unmetered
  // Gemini call is exactly what this exists to prevent.
  | { allowed: false; reason: "limits_unavailable"; kind: QuotaKind };

interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Takes one unit of `kind` for the signed-in user. Must be called with the
 * user's own client: the database reads the user from the JWT, never from a
 * parameter.
 */
export async function consumeDailyQuota(supabase: RpcClient, kind: QuotaKind, now = new Date()): Promise<QuotaResult> {
  const limit = dailyLimit(kind);
  const { data, error } = await supabase.rpc("consume_user_quota", { p_kind: kind, p_max: limit });
  if (error) {
    console.error(`[limits] consume_user_quota(${kind}) failed`, { message: error.message });
    reportEvent("limits.unavailable", { kind });
    return { allowed: false, reason: "limits_unavailable", kind };
  }
  if (data === true) return { allowed: true };
  reportEvent("limits.daily_limit_hit", { kind, limit });
  return { allowed: false, reason: "daily_limit", kind, limit, resetsAt: nextUtcMidnight(now) };
}

/**
 * Gives back one unit when the spend didn't happen for reasons outside the
 * user's control (Gemini 503/429, a failed token mint). Best effort: a lost
 * refund costs the user one unit, never the app any quota.
 */
export async function releaseDailyQuota(userId: string, kind: QuotaKind): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc("release_user_quota", { p_user: userId, p_kind: kind });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error(`[limits] release_user_quota(${kind}) failed`, error instanceof Error ? error.message : error);
  }
}

/** The JSON response for a refused quota check. */
export function quotaRefusal(result: Exclude<QuotaResult, { allowed: true }>): NextResponse {
  if (result.reason === "limits_unavailable") {
    return NextResponse.json({ error: "limits_unavailable" }, { status: 503 });
  }
  return NextResponse.json(
    { error: "daily_limit", kind: result.kind, limit: result.limit, resetsAt: result.resetsAt },
    { status: 429 },
  );
}

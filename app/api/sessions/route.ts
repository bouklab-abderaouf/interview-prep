import { NextResponse } from "next/server";
import { z } from "zod";

import { consumeDailyQuota, quotaRefusal, releaseDailyQuota } from "@/lib/limits";
import { createClient } from "@/lib/supabase/server";

const RequestSchema = z.object({
  stageId: z.string(),
  drill: z.boolean().optional(),
  questionIndex: z.number().int().min(0).optional(),
});

// specs §7.1 — create a session row when a stage interview starts. The
// session-scoped client means RLS ("stages of own roadmaps") does the
// ownership check for free: querying a stage you don't own returns null,
// not another user's row.
export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { stageId, drill, questionIndex } = parsed.data;

  const { data: stage, error: stageError } = await supabase
    .from("stages")
    .select("id, question_bank, roadmaps(language)")
    .eq("id", stageId)
    .maybeSingle<{
      id: string;
      question_bank: Array<{ text: string; targets: string; follow_ups?: string[] }> | null;
      roadmaps: { language: "fr" | "en" } | null;
    }>();
  if (stageError || !stage) {
    return NextResponse.json({ error: "stage_not_found" }, { status: 404 });
  }

  // specs §8.3 acceptance criteria — a user cannot start a locked stage by
  // editing the URL.
  const { data: progress } = await supabase
    .from("progress")
    .select("unlocked")
    .eq("user_id", userId)
    .eq("stage_id", stageId)
    .maybeSingle();
  if (!progress?.unlocked) {
    return NextResponse.json({ error: "stage_locked" }, { status: 403 });
  }

  // Rows are cheap but not free, and each one becomes a room that can mint a
  // token; a daily cap stops a script from filling the table.
  const quota = await consumeDailyQuota(supabase, "session_create");
  if (!quota.allowed) return quotaRefusal(quota);

  const qBank = Array.isArray(stage.question_bank) ? stage.question_bank : [];
  const targetQ =
    drill && questionIndex !== undefined && qBank[questionIndex]
      ? qBank[questionIndex]
      : drill && qBank[0]
        ? qBank[0]
        : null;

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      user_id: userId,
      stage_id: stageId,
      mode: "full",
      language: stage.roadmaps?.language ?? "fr",
      status: "active",
      usage: drill
        ? {
            drill: true,
            questionIndex: questionIndex ?? 0,
            targetQuestion: targetQ?.text ?? null,
            targets: targetQ?.targets ?? null,
            follow_ups: targetQ?.follow_ups ?? [],
          }
        : {},
    })
    .select("id")
    .single();
  if (sessionError) {
    console.error("[api/sessions] insert failed", sessionError);
    await releaseDailyQuota(userId, "session_create");
    return NextResponse.json({ error: "session_insert_failed" }, { status: 502 });
  }

  return NextResponse.json({ sessionId: session.id });
}

const BulkDeleteSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(200),
});

// Bulk delete for /interviews' "Clear empty sessions": a Start that never
// got an answer still leaves a row, and a dozen of them bury the real
// interviews. Same rules as DELETE /api/sessions/[id] — cascades to turns
// and scorecards, leaves XP and progress alone.
export async function DELETE(request: Request) {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BulkDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data: deleted, error } = await supabase
    .from("sessions")
    .delete()
    .in("id", parsed.data.ids)
    .eq("user_id", userId)
    .select("id");
  if (error) {
    console.error("[api/sessions] bulk delete failed", { message: error.message, code: error.code });
    return NextResponse.json({ error: "delete_failed" }, { status: 502 });
  }

  return NextResponse.json({ deleted: deleted?.length ?? 0 });
}

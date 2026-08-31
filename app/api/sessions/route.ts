import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const RequestSchema = z.object({ stageId: z.string() });

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
  const { stageId } = parsed.data;

  const { data: stage, error: stageError } = await supabase
    .from("stages")
    .select("id, roadmaps(language)")
    .eq("id", stageId)
    .maybeSingle<{ id: string; roadmaps: { language: "fr" | "en" } | null }>();
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

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      user_id: userId,
      stage_id: stageId,
      mode: "full",
      language: stage.roadmaps?.language ?? "fr",
      status: "active",
    })
    .select("id")
    .single();
  if (sessionError) {
    console.error("[api/sessions] insert failed", sessionError);
    return NextResponse.json({ error: "session_insert_failed" }, { status: 502 });
  }

  return NextResponse.json({ sessionId: session.id });
}

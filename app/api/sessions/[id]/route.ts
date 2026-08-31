import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const TurnSchema = z.object({
  role: z.enum(["interviewer", "candidate"]),
  transcript: z.string(),
  start_ms: z.number(),
  end_ms: z.number(),
});

const PatchSchema = z.object({
  turns: z.array(TurnSchema),
  status: z.enum(["active", "completed", "abandoned", "errored"]).optional(),
});

// specs §7.1 — flushes turns and (optionally) ends the session. Called both
// as a periodic 60s safety flush (status omitted) and on session end (status
// set) — also fired from the client on `beforeunload` via `fetch(...,
// {keepalive: true})` rather than navigator.sendBeacon, since sendBeacon is
// POST-only and can't carry a PATCH.
export async function PATCH(request: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  const { id: sessionId } = await ctx.params;
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

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { turns, status } = parsed.data;

  // RLS ("own sessions") scopes this to the caller's own row; a session that
  // doesn't exist or isn't theirs comes back null, not another user's data.
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, started_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError || !session) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }

  // Full-replace rather than a partial upsert: the client always sends the
  // complete current turns array, so delete-then-insert avoids any
  // conflict-resolution complexity for what's a small row count per session.
  const { error: deleteError } = await supabase.from("turns").delete().eq("session_id", sessionId);
  if (deleteError) {
    console.error("[api/sessions/:id] turns delete failed", deleteError);
    return NextResponse.json({ error: "turns_write_failed" }, { status: 502 });
  }

  if (turns.length > 0) {
    const { error: insertError } = await supabase.from("turns").insert(
      turns.map((turn, index) => ({
        session_id: sessionId,
        order_index: index,
        role: turn.role,
        transcript: turn.transcript,
        start_ms: turn.start_ms,
        end_ms: turn.end_ms,
      })),
    );
    if (insertError) {
      console.error("[api/sessions/:id] turns insert failed", insertError);
      return NextResponse.json({ error: "turns_write_failed" }, { status: 502 });
    }
  }

  if (status) {
    const isEnding = status !== "active";
    const durationSeconds = isEnding
      ? Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000)
      : undefined;

    const { error: updateError } = await supabase
      .from("sessions")
      .update({
        status,
        ...(isEnding ? { ended_at: new Date().toISOString(), duration_seconds: durationSeconds } : {}),
      })
      .eq("id", sessionId);
    if (updateError) {
      console.error("[api/sessions/:id] session update failed", updateError);
      return NextResponse.json({ error: "session_update_failed" }, { status: 502 });
    }
  }

  return NextResponse.json({ ok: true });
}

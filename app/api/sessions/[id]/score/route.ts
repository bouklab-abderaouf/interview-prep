import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { computeDeterministicMetrics, type Turn } from "@/lib/metrics/deterministic";
import { scoreSession } from "@/lib/gemini/score-session";
import { GapAnalysis, StageQuestionSchema } from "@/lib/gemini/schemas";
import { z } from "zod";
import type { InterviewLanguage } from "@/lib/live/types";

// specs §7.3 — one Gemini text call: transcript + stage focus_areas/
// question_bank + roadmap gaps + deterministic metrics in, Scorecard out.
export async function POST(request: Request, ctx: RouteContext<"/api/sessions/[id]/score">) {
  const { id: sessionId } = await ctx.params;
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, stage_id, language, duration_seconds")
    .eq("id", sessionId)
    .maybeSingle<{
      id: string;
      stage_id: string | null;
      language: InterviewLanguage;
      duration_seconds: number | null;
    }>();
  if (sessionError || !session || !session.stage_id) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }

  const { data: stage, error: stageError } = await supabase
    .from("stages")
    .select("focus_areas, question_bank, pass_score, order_index, roadmap_id")
    .eq("id", session.stage_id)
    .maybeSingle<{
      focus_areas: string[];
      question_bank: unknown;
      pass_score: number;
      order_index: number;
      roadmap_id: string;
    }>();
  if (stageError || !stage) {
    return NextResponse.json({ error: "stage_not_found" }, { status: 404 });
  }

  const { data: roadmap, error: roadmapError } = await supabase
    .from("roadmaps")
    .select("gap_analysis")
    .eq("id", stage.roadmap_id)
    .maybeSingle<{ gap_analysis: unknown }>();
  if (roadmapError || !roadmap) {
    return NextResponse.json({ error: "roadmap_not_found" }, { status: 404 });
  }

  const { data: turnRows, error: turnsError } = await supabase
    .from("turns")
    .select("role, transcript, start_ms, end_ms")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });
  if (turnsError) {
    return NextResponse.json({ error: "turns_fetch_failed" }, { status: 502 });
  }
  const turns: Turn[] = turnRows ?? [];
  if (turns.length === 0) {
    return NextResponse.json({ error: "no_turns_recorded" }, { status: 400 });
  }

  // roadmaps.gap_analysis is GapAnalysis minus `stages` (see app/api/analyze)
  const gapAnalysis = GapAnalysis.omit({ stages: true }).parse(roadmap.gap_analysis);
  const questionBank = z.array(StageQuestionSchema).parse(stage.question_bank);

  const metrics = computeDeterministicMetrics(turns, session.language);

  let scorecard;
  try {
    scorecard = await scoreSession({
      turns,
      focusAreas: stage.focus_areas,
      questionBank: questionBank.map((q) => q.text),
      gaps: gapAnalysis.gaps,
      candidate: gapAnalysis.candidate,
      metrics,
      language: session.language,
    });
  } catch (error) {
    console.error("[api/sessions/:id/score] scoring failed", error);
    return NextResponse.json({ error: "scoring_failed" }, { status: 502 });
  }

  // specs §7.3 — xp = round(overall * 1.5) + duration_bonus. duration_bonus
  // isn't specced further; 1 XP per minute spent is a reasonable, documented
  // reading, not a literal spec value.
  const durationBonus = Math.round((session.duration_seconds ?? 0) / 60);
  const xpAwarded = Math.round(scorecard.overall * 1.5) + durationBonus;
  const stars = scorecard.overall >= 85 ? 3 : scorecard.overall >= 70 ? 2 : scorecard.overall >= 55 ? 1 : 0;

  const { data: scorecardRow, error: scorecardError } = await supabase
    .from("scorecards")
    .insert({
      session_id: sessionId,
      overall: scorecard.overall,
      star: scorecard.star,
      relevance: scorecard.relevance,
      communication: {
        clarity: scorecard.clarity,
        pace_wpm: metrics.pace_wpm,
        filler_rate: metrics.filler_rate,
        talk_ratio: metrics.talk_ratio,
        longest_pause_ms: metrics.longest_pause_ms,
      },
      strengths: scorecard.strengths,
      improvements: scorecard.improvements,
      model_answers: scorecard.model_answers,
      xp_awarded: xpAwarded,
      stars,
    })
    .select("id")
    .single();
  if (scorecardError) {
    console.error("[api/sessions/:id/score] scorecard insert failed", scorecardError);
    return NextResponse.json({ error: "scorecard_insert_failed" }, { status: 502 });
  }

  // Update this stage's progress: attempts, best_score, stars, completed_at.
  const { data: progress } = await supabase
    .from("progress")
    .select("attempts, best_score, stars")
    .eq("user_id", userId)
    .eq("stage_id", session.stage_id)
    .maybeSingle<{ attempts: number; best_score: number | null; stars: number }>();

  await supabase
    .from("progress")
    .update({
      attempts: (progress?.attempts ?? 0) + 1,
      best_score: Math.max(progress?.best_score ?? 0, scorecard.overall),
      stars: Math.max(progress?.stars ?? 0, stars),
      completed_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("stage_id", session.stage_id);

  // specs §7.3 — stage unlocks the next when overall >= stages.pass_score.
  if (scorecard.overall >= stage.pass_score) {
    const { data: nextStage } = await supabase
      .from("stages")
      .select("id")
      .eq("roadmap_id", stage.roadmap_id)
      .eq("order_index", stage.order_index + 1)
      .maybeSingle<{ id: string }>();

    if (nextStage) {
      await supabase
        .from("progress")
        .update({ unlocked: true })
        .eq("user_id", userId)
        .eq("stage_id", nextStage.id);
    }
  }

  return NextResponse.json({ scorecardId: scorecardRow.id });
}

import Link from "next/link";

import { BackLink } from "@/components/nav/BackLink";
import { InterviewHistoryList } from "@/components/interview/InterviewHistoryList";
import type { InterviewSummary } from "@/lib/interviews";
import { createClient } from "@/lib/supabase/server";

interface SessionRow {
  id: string;
  stage_id: string | null;
  status: string;
  started_at: string;
  duration_seconds: number | null;
  language: string;
  usage: { drill?: boolean; targetQuestion?: string } | null;
}

interface StageRow {
  id: string;
  title: string;
  roadmap_id: string;
}

interface RoadmapRow {
  id: string;
  target_role: string;
  company: string | null;
}

// Every interview ever run, scored or not. Sessions have always been recorded
// in Postgres; nothing ever showed them back to the person who ran them.
export default async function InterviewsPage() {
  const { items, readAt } = await loadInterviews();

  // Sessions are newest first, so the first one with a roadmap is where the
  // candidate was last practising.
  const practiceHref = items.find((i) => i.roadmapId)?.roadmapId;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-8">
      <div className="flex flex-col gap-4">
        <BackLink href="/home">Home</BackLink>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Interviews</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Every session you&apos;ve started, newest first. Open one to see its scorecard.
            </p>
          </div>
          <Link
            href={practiceHref ? `/roadmap/${practiceHref}` : "/home"}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Practise again <span aria-hidden>&rarr;</span>
          </Link>
        </header>
      </div>

      {items.length > 0 ? (
        <InterviewHistoryList items={items} now={readAt} />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
          <p className="font-medium">No interviews yet</p>
          <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
            Open a roadmap and start a stage. Each interview you run shows up here with its score.
          </p>
        </div>
      )}
    </main>
  );
}

// `readAt` is when the rows were read: "is this session still in progress?"
// is a question about that snapshot, so the clock travels with the data.
async function loadInterviews(): Promise<{ items: InterviewSummary[]; readAt: number }> {
  const supabase = await createClient();
  const readAt = Date.now();

  // Demo sessions have a null user_id and are invisible under RLS anyway;
  // filtering on mode keeps the unguarded `/session/[id]` smoke tests out too.
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, stage_id, status, started_at, duration_seconds, language, usage")
    .eq("mode", "full")
    .order("started_at", { ascending: false })
    .returns<SessionRow[]>();

  const stageIds = [...new Set((sessions ?? []).map((s) => s.stage_id).filter(Boolean))] as string[];
  const sessionIds = (sessions ?? []).map((s) => s.id);

  // Fetched separately and joined here rather than with PostgREST embedding:
  // `scorecards.session_id` is unique, so an embed's result shape (object vs
  // array) depends on relationship detection, and these tables are small.
  const [{ data: stages }, { data: scorecards }, { data: turnCounts }] = await Promise.all([
    stageIds.length
      ? supabase.from("stages").select("id, title, roadmap_id").in("id", stageIds).returns<StageRow[]>()
      : Promise.resolve({ data: null }),
    sessionIds.length
      ? supabase
          .from("scorecards")
          .select("session_id, overall, stars, xp_awarded")
          .in("session_id", sessionIds)
          .returns<{ session_id: string; overall: number; stars: number; xp_awarded: number }[]>()
      : Promise.resolve({ data: null }),
    sessionIds.length
      ? supabase
          .from("turns")
          .select("session_id")
          .in("session_id", sessionIds)
          .returns<{ session_id: string }[]>()
      : Promise.resolve({ data: null }),
  ]);

  const roadmapIds = [...new Set((stages ?? []).map((s) => s.roadmap_id))];
  const { data: roadmaps } = roadmapIds.length
    ? await supabase
        .from("roadmaps")
        .select("id, target_role, company")
        .in("id", roadmapIds)
        .returns<RoadmapRow[]>()
    : { data: null };

  const stageById = new Map((stages ?? []).map((s) => [s.id, s]));
  const roadmapById = new Map((roadmaps ?? []).map((r) => [r.id, r]));
  const scorecardBySession = new Map((scorecards ?? []).map((s) => [s.session_id, s]));
  const turnsBySession = (turnCounts ?? []).reduce<Map<string, number>>((acc, turn) => {
    acc.set(turn.session_id, (acc.get(turn.session_id) ?? 0) + 1);
    return acc;
  }, new Map());

  const items: InterviewSummary[] = (sessions ?? []).map((session) => {
    const stage = session.stage_id ? stageById.get(session.stage_id) : undefined;
    const roadmap = stage ? roadmapById.get(stage.roadmap_id) : undefined;
    const scorecard = scorecardBySession.get(session.id);

    return {
      id: session.id,
      stageTitle: stage?.title ?? "Voice loop test",
      roadmapId: roadmap?.id,
      roadmapContext: roadmap
        ? `${roadmap.target_role}${roadmap.company ? ` at ${roadmap.company}` : ""}`
        : undefined,
      startedAt: session.started_at,
      durationSeconds: session.duration_seconds,
      turns: turnsBySession.get(session.id) ?? 0,
      language: session.language,
      status: session.status,
      drill: Boolean(session.usage?.drill),
      targetQuestion: session.usage?.targetQuestion,
      hasStage: Boolean(session.stage_id),
      scorecard: scorecard
        ? { overall: scorecard.overall, stars: scorecard.stars, xp_awarded: scorecard.xp_awarded }
        : null,
    };
  });

  return { items, readAt };
}

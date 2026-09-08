import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/nav/BackLink";
import { formatDateTime, formatDuration } from "@/lib/format";

interface SessionRow {
  id: string;
  stage_id: string | null;
  status: string;
  started_at: string;
  duration_seconds: number | null;
  language: string;
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

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  abandoned: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  errored: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  active: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};

// Every interview ever run, scored or not. Sessions have always been recorded
// in Postgres; nothing ever showed them back to the person who ran them.
export default async function InterviewsPage() {
  const supabase = await createClient();

  // Demo sessions have a null user_id and are invisible under RLS anyway;
  // filtering on mode keeps the unguarded `/session/[id]` smoke tests out too.
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, stage_id, status, started_at, duration_seconds, language")
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

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
      <BackLink href="/home">Home</BackLink>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Interviews</h1>
        <p className="text-sm text-zinc-500">
          {sessions?.length ?? 0} session{sessions?.length === 1 ? "" : "s"}. Scored ones open their
          scorecard.
        </p>
      </header>

      {sessions && sessions.length > 0 ? (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {sessions.map((session) => {
            const stage = session.stage_id ? stageById.get(session.stage_id) : undefined;
            const roadmap = stage ? roadmapById.get(stage.roadmap_id) : undefined;
            const scorecard = scorecardBySession.get(session.id);
            const turns = turnsBySession.get(session.id) ?? 0;

            const body = (
              <div className="flex items-center justify-between gap-4 py-4">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{stage?.title ?? "Voice loop test"}</span>
                  <span className="text-sm text-zinc-500">
                    {roadmap
                      ? `${roadmap.target_role}${roadmap.company ? ` at ${roadmap.company}` : ""} · `
                      : ""}
                    {formatDateTime(session.started_at)}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {formatDuration(session.duration_seconds)} &middot; {turns} turn
                    {turns === 1 ? "" : "s"} &middot; {session.language.toUpperCase()}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {scorecard ? (
                    <>
                      <span className="text-sm text-amber-500" aria-label={`${scorecard.stars} of 3 stars`}>
                        {"★".repeat(scorecard.stars)}
                        <span className="text-zinc-300 dark:text-zinc-700">
                          {"★".repeat(3 - scorecard.stars)}
                        </span>
                      </span>
                      <span className="text-lg font-medium tabular-nums">{scorecard.overall}</span>
                    </>
                  ) : (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs capitalize ${
                        STATUS_STYLES[session.status] ?? STATUS_STYLES.abandoned
                      }`}
                    >
                      {session.status}
                    </span>
                  )}
                </div>
              </div>
            );

            return (
              <li key={session.id}>
                {scorecard ? (
                  <Link href={`/scorecard/${session.id}`} className="block hover:opacity-70">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">
          Nothing yet. Open a roadmap and start a stage to run your first interview.
        </p>
      )}
    </main>
  );
}

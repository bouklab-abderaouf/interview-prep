import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { XpBar } from "@/components/roadmap/XpBar";
import { formatDate, formatDuration } from "@/lib/format";

interface RoadmapRow {
  id: string;
  target_role: string;
  company: string | null;
  language: string;
  created_at: string;
}

interface StageRow {
  id: string;
  roadmap_id: string;
  title: string;
}

interface ProgressRow {
  stage_id: string;
  unlocked: boolean;
  best_score: number | null;
  stars: number;
}

interface SessionRow {
  id: string;
  stage_id: string | null;
  status: string;
  started_at: string;
  duration_seconds: number | null;
}

// The hub the app never had. Everything authenticated used to be a leaf you
// could only reach by typing a URL: sign-in dropped you straight into
// /onboarding, which builds a *new* roadmap every time, so a returning user
// had no route back to the work they'd already done.
export default async function HomePage() {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub as string | undefined;

  const { data: roadmaps } = await supabase
    .from("roadmaps")
    .select("id, target_role, company, language, created_at")
    .order("created_at", { ascending: false })
    .returns<RoadmapRow[]>();

  // First run has nothing to show and no decision to make — go straight to
  // the thing they'd have to click anyway.
  if (!roadmaps || roadmaps.length === 0) redirect("/onboarding");

  const roadmapIds = roadmaps.map((r) => r.id);

  const [{ data: stages }, { data: progressRows }, { data: sessions }, { data: profile }] =
    await Promise.all([
      supabase
        .from("stages")
        .select("id, roadmap_id, title")
        .in("roadmap_id", roadmapIds)
        .order("order_index", { ascending: true })
        .returns<StageRow[]>(),
      supabase
        .from("progress")
        .select("stage_id, unlocked, best_score, stars")
        .returns<ProgressRow[]>(),
      supabase
        .from("sessions")
        .select("id, stage_id, status, started_at, duration_seconds")
        .eq("mode", "full")
        .order("started_at", { ascending: false })
        .limit(5)
        .returns<SessionRow[]>(),
      userId
        ? supabase
            .from("profiles")
            .select("total_xp, streak_days")
            .eq("id", userId)
            .maybeSingle<{ total_xp: number; streak_days: number }>()
        : Promise.resolve({ data: null }),
    ]);

  const progressByStage = new Map((progressRows ?? []).map((p) => [p.stage_id, p]));
  const stageById = new Map((stages ?? []).map((s) => [s.id, s]));

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: scorecards } = sessionIds.length
    ? await supabase
        .from("scorecards")
        .select("session_id, overall, stars")
        .in("session_id", sessionIds)
        .returns<{ session_id: string; overall: number; stars: number }[]>()
    : { data: null };
  const scorecardBySession = new Map((scorecards ?? []).map((s) => [s.session_id, s]));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 p-8">
      <header className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Your prep</h1>
        <XpBar totalXp={profile?.total_xp ?? 0} streakDays={profile?.streak_days ?? 0} />
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium">Roadmaps</h2>
          <Link href="/onboarding" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            New roadmap
          </Link>
        </div>

        <ul className="flex flex-col gap-3">
          {roadmaps.map((roadmap) => {
            const roadmapStages = (stages ?? []).filter((s) => s.roadmap_id === roadmap.id);
            const attempted = roadmapStages.filter(
              (s) => progressByStage.get(s.id)?.best_score != null,
            ).length;
            const unlocked = roadmapStages.filter((s) => progressByStage.get(s.id)?.unlocked).length;

            // A roadmap with no stages is the orphan a failed /api/analyze
            // leaves behind (see README). Linking to it would just open an
            // empty skill tree, so say what it is instead.
            const incomplete = roadmapStages.length === 0;

            const title = (
              <span className="font-medium">
                {roadmap.target_role}
                {roadmap.company ? ` at ${roadmap.company}` : ""}
              </span>
            );

            if (incomplete) {
              return (
                <li
                  key={roadmap.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-zinc-500">{title}</span>
                    <span className="text-sm text-zinc-500">
                      Analysis didn&rsquo;t finish &mdash; no stages were built. Created{" "}
                      {formatDate(roadmap.created_at)}.
                    </span>
                  </div>
                  <Link
                    href="/onboarding"
                    className="shrink-0 text-sm text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Try again
                  </Link>
                </li>
              );
            }

            return (
              <li key={roadmap.id}>
                <Link
                  href={`/roadmap/${roadmap.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                >
                  <div className="flex flex-col gap-1">
                    {title}
                    <span className="text-sm text-zinc-500">
                      {attempted} of {roadmapStages.length} stages attempted &middot; {unlocked}{" "}
                      unlocked &middot; created {formatDate(roadmap.created_at)}
                    </span>
                  </div>
                  <span className="text-sm text-zinc-400" aria-hidden>
                    &rarr;
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium">Recent interviews</h2>
          <Link href="/interviews" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
            View all
          </Link>
        </div>

        {sessions && sessions.length > 0 ? (
          <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {sessions.map((session) => {
              const scorecard = scorecardBySession.get(session.id);
              const stage = session.stage_id ? stageById.get(session.stage_id) : undefined;

              const row = (
                <div className="flex items-center justify-between gap-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{stage?.title ?? "Voice loop test"}</span>
                    <span className="text-xs text-zinc-500">
                      {formatDate(session.started_at)} &middot;{" "}
                      {formatDuration(session.duration_seconds)}
                    </span>
                  </div>
                  {scorecard ? (
                    <span className="text-sm tabular-nums">
                      <span className="font-medium">{scorecard.overall}</span>
                      <span className="text-zinc-500">/100</span>
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-500 capitalize">{session.status}</span>
                  )}
                </div>
              );

              return (
                <li key={session.id}>
                  {scorecard ? (
                    <Link href={`/scorecard/${session.id}`} className="block hover:opacity-70">
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            No interviews yet — open a roadmap and start a stage.
          </p>
        )}
      </section>
    </main>
  );
}

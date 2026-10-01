import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ScorecardView, type StageProgressInfo } from "@/components/scorecard/ScorecardView";
import { BackLink } from "@/components/nav/BackLink";
import { StartStageButton } from "@/components/roadmap/StartStageButton";
import { LocalTime } from "@/components/ui/LocalTime";
import { formatDuration } from "@/lib/format";

// specs §7.4 — score ring/stars/XP/verdict above the fold; STAR radar,
// communication metrics with reference ranges, strengths, improvements,
// model answers, and the full transcript below.
export default async function ScorecardPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const { data: scorecard } = await supabase
    .from("scorecards")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!scorecard) notFound();

  // A scorecard on its own is a dead end: no way back, and no way to tell
  // which stage of which roadmap it belongs to. Both come from the session.
  const [{ data: session }, { data: turns }] = await Promise.all([
    supabase
      .from("sessions")
      .select("stage_id, started_at, duration_seconds, usage")
      .eq("id", sessionId)
      .maybeSingle<{
        stage_id: string | null;
        started_at: string;
        duration_seconds: number | null;
        usage: {
          drill?: boolean;
          targetQuestion?: string | null;
          targets?: string | null;
        } | null;
      }>(),
    supabase
      .from("turns")
      .select("role, transcript, start_ms, end_ms")
      .eq("session_id", sessionId)
      .order("order_index", { ascending: true }),
  ]);

  const { data: stage } = session?.stage_id
    ? await supabase
        .from("stages")
        .select("id, title, roadmap_id, pass_score, order_index, persona")
        .eq("id", session.stage_id)
        .maybeSingle<{
          id: string;
          title: string;
          roadmap_id: string;
          pass_score: number;
          order_index: number;
          persona: { name?: string } | null;
        }>()
    : { data: null };

  const progress = stage && session ? await loadStageProgress(supabase, stage, session.started_at) : undefined;

  const { data: roadmap } = stage
    ? await supabase
        .from("roadmaps")
        .select("id, target_role, company")
        .eq("id", stage.roadmap_id)
        .maybeSingle<{ id: string; target_role: string; company: string | null }>()
    : { data: null };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8 pb-0">
      <BackLink href={roadmap ? `/roadmap/${roadmap.id}` : "/interviews"}>
        {roadmap
          ? `${roadmap.target_role}${roadmap.company ? ` at ${roadmap.company}` : ""}`
          : "Interviews"}
      </BackLink>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{stage?.title ?? "Scorecard"}</h1>
          <p className="text-sm text-zinc-500">
            <LocalTime iso={session?.started_at ?? null} /> &middot;{" "}
            {formatDuration(session?.duration_seconds ?? null)}
          </p>
        </div>

        {stage && <StartStageButton stageId={stage.id} label="Try this stage again" />}
      </header>

      <ScorecardView
        overall={scorecard.overall}
        stars={scorecard.stars}
        xpAwarded={scorecard.xp_awarded}
        star={scorecard.star}
        communication={scorecard.communication}
        strengths={scorecard.strengths}
        improvements={scorecard.improvements}
        modelAnswers={scorecard.model_answers}
        relevance={scorecard.relevance}
        perQuestion={scorecard.per_question ?? []}
        turns={turns ?? []}
        isDrill={Boolean(session?.usage?.drill)}
        drillQuestion={session?.usage?.targetQuestion}
        progress={progress}
        stageId={stage?.id}
        interviewerName={stage?.persona?.name}
      />
    </div>
  );
}

// The pass mark, what passing unlocks, and how earlier full interviews on the
// same stage scored — drills excluded, since they don't count toward the
// stage (see app/api/sessions/[id]/score). Separate queries merged in JS, like
// the list pages: scorecards.session_id's uniqueness makes PostgREST embedding
// shapes depend on relationship detection.
async function loadStageProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  stage: { id: string; roadmap_id: string; pass_score: number; order_index: number },
  startedAt: string,
): Promise<StageProgressInfo> {
  const [{ data: nextStage }, { data: earlierSessions }] = await Promise.all([
    supabase
      .from("stages")
      .select("title")
      .eq("roadmap_id", stage.roadmap_id)
      .eq("order_index", stage.order_index + 1)
      .maybeSingle<{ title: string }>(),
    supabase
      .from("sessions")
      .select("id, started_at, usage")
      .eq("stage_id", stage.id)
      .lt("started_at", startedAt)
      .order("started_at", { ascending: true })
      .returns<{ id: string; started_at: string; usage: { drill?: boolean } | null }[]>(),
  ]);

  const fullInterviews = (earlierSessions ?? []).filter((s) => !s.usage?.drill);
  const { data: earlierScores } = fullInterviews.length
    ? await supabase
        .from("scorecards")
        .select("session_id, overall")
        .in(
          "session_id",
          fullInterviews.map((s) => s.id),
        )
        .returns<{ session_id: string; overall: number }[]>()
    : { data: [] };

  const scoreBySession = new Map((earlierScores ?? []).map((row) => [row.session_id, row.overall]));
  return {
    passScore: stage.pass_score,
    nextStageTitle: nextStage?.title ?? null,
    previousScores: fullInterviews
      .map((s) => scoreBySession.get(s.id))
      .filter((score): score is number => score !== undefined),
  };
}

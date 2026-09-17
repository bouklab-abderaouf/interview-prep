import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ScorecardView } from "@/components/scorecard/ScorecardView";
import { BackLink } from "@/components/nav/BackLink";
import { StartStageButton } from "@/components/roadmap/StartStageButton";
import { formatDateTime, formatDuration } from "@/lib/format";

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
      .select("role, transcript")
      .eq("session_id", sessionId)
      .order("order_index", { ascending: true }),
  ]);

  const { data: stage } = session?.stage_id
    ? await supabase
        .from("stages")
        .select("id, title, roadmap_id")
        .eq("id", session.stage_id)
        .maybeSingle<{ id: string; title: string; roadmap_id: string }>()
    : { data: null };

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
            {formatDateTime(session?.started_at ?? null)} &middot;{" "}
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
        turns={turns ?? []}
        isDrill={Boolean(session?.usage?.drill)}
        drillQuestion={session?.usage?.targetQuestion}
      />
    </div>
  );
}

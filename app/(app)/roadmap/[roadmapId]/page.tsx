import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { SkillTree } from "@/components/roadmap/SkillTree";
import { XpBar } from "@/components/roadmap/XpBar";
import type { RoadmapStage, StageProgress } from "@/components/roadmap/types";

// specs §8.1 — skill tree with four stage nodes, XP bar and streak counter in
// the header. All state is read from Postgres per request, so §8's
// "progression state survives a hard refresh" is structural rather than
// something the client has to persist.
export default async function RoadmapPage({
  params,
}: {
  params: Promise<{ roadmapId: string }>;
}) {
  const { roadmapId } = await params;
  const supabase = await createClient();

  const { data: roadmap } = await supabase
    .from("roadmaps")
    .select("id, target_role, company")
    .eq("id", roadmapId)
    .maybeSingle();
  if (!roadmap) notFound();

  const { data: stages } = await supabase
    .from("stages")
    .select("id, order_index, slug, title, description, focus_areas, pass_score")
    .eq("roadmap_id", roadmapId)
    .order("order_index", { ascending: true })
    .returns<RoadmapStage[]>();

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  const { data: progressRows } = userId
    ? await supabase
        .from("progress")
        .select("stage_id, unlocked, attempts, best_score, stars")
        .eq("user_id", userId)
        .returns<(StageProgress & { stage_id: string })[]>()
    : { data: null };

  const { data: profile } = userId
    ? await supabase
        .from("profiles")
        .select("total_xp, streak_days")
        .eq("id", userId)
        .maybeSingle<{ total_xp: number; streak_days: number }>()
    : { data: null };

  const progressByStageId = Object.fromEntries(
    (progressRows ?? []).map(({ stage_id, ...progress }) => [stage_id, progress]),
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-medium">
            {roadmap.target_role}
            {roadmap.company ? ` at ${roadmap.company}` : ""}
          </h1>
          <p className="text-sm text-zinc-500">Four stages. Clear one to unlock the next.</p>
        </div>
        <XpBar totalXp={profile?.total_xp ?? 0} streakDays={profile?.streak_days ?? 0} />
      </header>

      <SkillTree stages={stages ?? []} progressByStageId={progressByStageId} />
    </main>
  );
}

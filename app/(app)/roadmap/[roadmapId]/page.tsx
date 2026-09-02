import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { StartStageButton } from "@/components/roadmap/StartStageButton";

// Phase 4 §8.1 minimal slice — just enough to list a roadmap's 4 stages and
// start an unlocked one, so Phase 3's session/turn-capture/scoring path has
// a real UI trigger to verify against. The real skill tree (serpentine
// path, node states, Framer Motion) is still to come.
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
    .select("id, order_index, slug, title, description, pass_score")
    .eq("roadmap_id", roadmapId)
    .order("order_index", { ascending: true });

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  const { data: progressRows } = userId
    ? await supabase
        .from("progress")
        .select("stage_id, unlocked, attempts, best_score, stars")
        .eq("user_id", userId)
    : { data: null };

  const progressByStageId = new Map((progressRows ?? []).map((p) => [p.stage_id, p]));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-xl font-medium">
        {roadmap.target_role}
        {roadmap.company ? ` at ${roadmap.company}` : ""}
      </h1>

      <ul className="flex flex-col gap-4">
        {(stages ?? []).map((stage) => {
          const progress = progressByStageId.get(stage.id);
          const unlocked = progress?.unlocked ?? false;
          return (
            <li key={stage.id} className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">
                    {stage.order_index + 1}. {stage.title}
                  </p>
                  <p className="text-sm text-zinc-500">{stage.description}</p>
                  {progress && (
                    <p className="mt-1 text-xs text-zinc-400">
                      {progress.attempts} attempt{progress.attempts === 1 ? "" : "s"}
                      {progress.best_score !== null ? ` · best ${progress.best_score}` : ""}
                      {progress.stars > 0 ? ` · ${"★".repeat(progress.stars)}` : ""}
                    </p>
                  )}
                </div>
                {unlocked ? (
                  <StartStageButton stageId={stage.id} />
                ) : (
                  <span className="text-sm text-zinc-400">Locked</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

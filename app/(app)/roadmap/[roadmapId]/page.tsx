// Phase 4 §8.1 — skill tree: four stage nodes, XP bar, streak counter.
export default async function RoadmapPage({
  params,
}: {
  params: Promise<{ roadmapId: string }>;
}) {
  const { roadmapId } = await params;
  return (
    <main className="flex flex-1 items-center justify-center p-16">
      <p className="text-zinc-500">Roadmap {roadmapId} — built in Phase 4.</p>
    </main>
  );
}

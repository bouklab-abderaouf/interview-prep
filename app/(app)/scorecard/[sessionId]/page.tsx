// Phase 3 §7.4 — scorecard UI: score ring, STAR radar, strengths, transcript.
export default async function ScorecardPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <main className="flex flex-1 items-center justify-center p-16">
      <p className="text-zinc-500">Scorecard {sessionId} — built in Phase 3.</p>
    </main>
  );
}

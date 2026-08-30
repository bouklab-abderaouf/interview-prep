// Phase 0 §4 — the interview room. The walking-skeleton voice loop lives here
// once lib/audio and lib/live are implemented (specs §4.2–§4.5).
export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <main className="flex flex-1 items-center justify-center p-16">
      <p className="text-zinc-500">Session {sessionId} — voice loop not wired up yet.</p>
    </main>
  );
}

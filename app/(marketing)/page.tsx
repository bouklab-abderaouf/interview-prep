// Phase 1 §5.1 — order matters: value prop + reel, demo CTA, sample link,
// how-it-works, GitHub. Most visitors consume nothing past the reel.

const HOW_IT_WORKS = [
  {
    title: "Upload your CV and the job description",
    body: "One PDF, one paste. No account needed for the demo.",
  },
  {
    title: "Talk through a live spoken interview",
    body: "A real-time voice model asks questions built from the actual gaps between your CV and the role.",
  },
  {
    title: "Get a scorecard, not just a transcript",
    body: "STAR breakdown, pacing, filler words, and model answers grounded in your own experience.",
  },
];

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-16 px-6 py-16">
      {/* No page anywhere linked to /sign-in or /onboarding until now —
          the whole authenticated flow was only reachable by typing the
          URL by hand. */}
      <a href="/sign-in" className="self-end text-sm underline">
        Sign in
      </a>

      <section className="flex max-w-2xl flex-col items-center gap-6 text-center">
        <h1 className="text-3xl font-semibold">
          Practice the interview out loud, before it counts.
        </h1>

        {/* Recorded after Phase 3 (specs §5.1) — real screen capture of a
            session + its scorecard. Slot reserved now. */}
        <div className="flex aspect-video w-full items-center justify-center rounded border border-zinc-400 bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-900">
          Demo reel — recorded after Phase 3
        </div>

        <a
          href="/demo"
          className="rounded bg-black px-6 py-3 font-medium text-white dark:bg-white dark:text-black"
        >
          Try a 2-minute demo
        </a>

        <a href="/sample-scorecard" className="text-sm underline">
          See a sample scorecard
        </a>

        <a href="/onboarding" className="text-sm underline">
          Practice with your own CV instead
        </a>
      </section>

      <section className="grid w-full max-w-3xl gap-8 sm:grid-cols-3">
        {HOW_IT_WORKS.map((step, index) => (
          <div key={step.title} className="flex flex-col gap-2 text-center">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-zinc-400 text-sm">
              {index + 1}
            </div>
            <h2 className="font-medium">{step.title}</h2>
            <p className="text-sm text-zinc-500">{step.body}</p>
          </div>
        ))}
      </section>

      {/* Placeholder — fill in the real repo URL. */}
      <a href="#" className="text-sm underline">
        GitHub repo (add your link here)
      </a>
    </main>
  );
}

import { InteractiveDemoPreview } from "@/components/marketing/InteractiveDemoPreview";

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
      {/* Sign in link */}
      <a href="/sign-in" className="self-end text-sm underline text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white">
        Sign in
      </a>

      <section className="flex max-w-2xl flex-col items-center gap-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Practice the interview out loud, before it counts.
        </h1>
        <p className="text-sm text-zinc-500 max-w-lg">
          Live AI interviews powered by Gemini Live API with sub-second interruption,
          tailored specifically to your CV and target role.
        </p>

        {/* Interactive preview showcasing live audio dialogue and scorecard telemetry */}
        <div className="w-full">
          <InteractiveDemoPreview />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <a
            href="/demo"
            className="rounded bg-black px-6 py-3 font-medium text-white transition-opacity hover:opacity-85 dark:bg-white dark:text-black"
          >
            Try a 2-minute demo
          </a>

          <a href="/sample-scorecard" className="text-sm underline text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white">
            See a sample scorecard
          </a>
        </div>

        <a href="/onboarding" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          Practice with your own CV instead &rarr;
        </a>
      </section>

      <section className="grid w-full max-w-3xl gap-8 sm:grid-cols-3">
        {HOW_IT_WORKS.map((step, index) => (
          <div key={step.title} className="flex flex-col gap-2 text-center">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-zinc-400 text-sm font-medium">
              {index + 1}
            </div>
            <h2 className="font-medium">{step.title}</h2>
            <p className="text-sm text-zinc-500">{step.body}</p>
          </div>
        ))}
      </section>

      <a
        href="https://github.com/bouklab-abderaouf/interview-prep"
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm underline text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
      >
        View on GitHub &rarr;
      </a>
    </main>
  );
}


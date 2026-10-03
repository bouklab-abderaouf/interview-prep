import { ScorecardView } from "@/components/scorecard/ScorecardView";
import { sampleScorecard } from "@/lib/fixtures/sample-scorecard";

// specs §7.4 — public read-only scorecard, no auth. Meant to use "a real
// scorecard of mine"; see lib/fixtures/sample-scorecard.ts for why it's a
// fixture for now.
export default function SampleScorecardPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      {/* Every page needs a level-1 heading; this one had none until the
          accessibility checks in e2e/ flagged it. */}
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sample scorecard</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          What you get after every interview. This one is an example, not a real candidate.
        </p>
      </header>
      <ScorecardView
        overall={sampleScorecard.overall}
        stars={sampleScorecard.stars}
        xpAwarded={sampleScorecard.xp_awarded}
        star={sampleScorecard.star}
        relevance={sampleScorecard.relevance}
        communication={sampleScorecard.communication}
        strengths={sampleScorecard.strengths}
        improvements={sampleScorecard.improvements}
        modelAnswers={sampleScorecard.model_answers}
        perQuestion={sampleScorecard.per_question}
        turns={sampleScorecard.turns}
      />
    </main>
  );
}

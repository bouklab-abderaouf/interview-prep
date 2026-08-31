import { ScorecardView } from "@/components/scorecard/ScorecardView";
import { sampleScorecard } from "@/lib/fixtures/sample-scorecard";

// specs §7.4 — public read-only scorecard, no auth. Meant to use "a real
// scorecard of mine"; see lib/fixtures/sample-scorecard.ts for why it's a
// fixture for now.
export default function SampleScorecardPage() {
  return (
    <main className="flex flex-1 flex-col">
      <ScorecardView
        overall={sampleScorecard.overall}
        stars={sampleScorecard.stars}
        xpAwarded={sampleScorecard.xp_awarded}
        star={sampleScorecard.star}
        communication={sampleScorecard.communication}
        strengths={sampleScorecard.strengths}
        improvements={sampleScorecard.improvements}
        modelAnswers={sampleScorecard.model_answers}
        turns={sampleScorecard.turns}
      />
    </main>
  );
}

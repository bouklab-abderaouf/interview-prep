import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ScorecardView } from "@/components/scorecard/ScorecardView";

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

  const { data: turns } = await supabase
    .from("turns")
    .select("role, transcript")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });

  return (
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
    />
  );
}

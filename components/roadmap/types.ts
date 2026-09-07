export interface RoadmapStage {
  id: string;
  order_index: number;
  slug: string;
  title: string;
  description: string | null;
  focus_areas: string[];
  pass_score: number;
}

export interface StageProgress {
  unlocked: boolean;
  attempts: number;
  best_score: number | null;
  stars: number;
}

// specs §8.1's three node states. "attempted" covers the spec's "completed"
// (stars filled) — a stage that's been played shows its stars whether or not
// the score cleared pass_score, which is honest about a failed attempt
// instead of pretending it never happened.
export type StageState = "locked" | "available" | "attempted";

export function stageStateFor(progress: StageProgress | undefined): StageState {
  if (!progress?.unlocked) return "locked";
  return progress.best_score === null ? "available" : "attempted";
}

// Scoring → progression rules: XP, stars and streaks. Pure (the clock is a
// parameter) so the numbers behind the XP bar and skill tree can be tested
// without a database; app/api/sessions/[id]/score is the only writer.

// specs §7.3 — xp = round(overall * 1.5) + duration_bonus, where the bonus is
// 1 XP per minute (the spec names it without defining it). A 2-minute drill
// earns 15–40 XP plus its duration bonus instead, so it rewards focused
// practice without distorting level progression.
export function xpForSession({
  overall,
  durationSeconds,
  drill,
}: {
  overall: number;
  durationSeconds: number | null;
  drill: boolean;
}): number {
  const durationBonus = Math.round((durationSeconds ?? 0) / 60);
  return drill
    ? Math.max(15, Math.round(overall * 0.4)) + durationBonus
    : Math.round(overall * 1.5) + durationBonus;
}

export function starsForScore(overall: number): number {
  return overall >= 85 ? 3 : overall >= 70 ? 2 : overall >= 55 ? 1 : 0;
}

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// Same UTC day: unchanged. Consecutive day: +1. Any longer gap (or a first
// ever session): back to 1. specs §8.3 defers streak freezes, so a missed
// day simply resets.
export function nextStreak(current: number, lastActive: string | null, now: Date): number {
  if (lastActive === utcDay(now)) return Math.max(current, 1);

  const yesterday = utcDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (lastActive === yesterday) return current + 1;

  return 1;
}

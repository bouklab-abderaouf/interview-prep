// specs §8.1 — "XP bar in the header, streak counter". The spec defines no
// level system or target, so the bar fills toward the next milestone;
// XP_PER_LEVEL is a chosen number, not a specced one.
const XP_PER_LEVEL = 500;

interface XpBarProps {
  totalXp: number;
  streakDays: number;
}

export function XpBar({ totalXp, streakDays }: XpBarProps) {
  const level = Math.floor(totalXp / XP_PER_LEVEL) + 1;
  const intoLevel = totalXp % XP_PER_LEVEL;
  const pct = Math.round((intoLevel / XP_PER_LEVEL) * 100);

  return (
    <div className="flex items-center gap-5">
      <div className="flex-1">
        <div className="mb-1 flex items-baseline justify-between text-xs text-zinc-500">
          <span>Level {level}</span>
          <span className="tabular-nums">
            {intoLevel} / {XP_PER_LEVEL} XP
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          role="progressbar"
          aria-valuenow={intoLevel}
          aria-valuemin={0}
          aria-valuemax={XP_PER_LEVEL}
          aria-label={`Level ${level} progress`}
        >
          <div
            className="h-full rounded-full bg-blue-500 transition-[width] duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-sm">
        <span aria-hidden>🔥</span>
        <span className="font-medium tabular-nums">{streakDays}</span>
        <span className="text-zinc-500">day{streakDays === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}

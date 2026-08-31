import { StarRadar } from "@/components/scorecard/StarRadar";
import { ScoreRing } from "@/components/scorecard/ScoreRing";

interface StrengthItem {
  point: string;
  quote_from_answer: string;
}
interface ImprovementItem {
  point: string;
  why_it_matters: string;
  what_to_say_instead: string;
}
interface ModelAnswerItem {
  question: string;
  strong_answer: string;
}
interface Communication {
  clarity: number;
  pace_wpm: number;
  filler_rate: number;
  talk_ratio: number;
  longest_pause_ms: number;
}
interface TranscriptTurn {
  role: string;
  transcript: string;
}

export interface ScorecardViewProps {
  overall: number;
  stars: number;
  xpAwarded: number;
  star: { situation: number; task: number; action: number; result: number };
  communication: Communication;
  strengths: StrengthItem[];
  improvements: ImprovementItem[];
  modelAnswers: ModelAnswerItem[];
  turns: TranscriptTurn[];
}

// Only pace_wpm's range (120-160) comes from the spec directly (§7.4's own
// example). The rest are a reasonable judgment call, not a specced value.
const REFERENCE_RANGES: Record<keyof Omit<Communication, "clarity">, { label: string; range: string }> = {
  pace_wpm: { label: "Pace", range: "natural range 120–160 wpm" },
  filler_rate: { label: "Filler words", range: "under 3 per 100 words is unremarkable" },
  talk_ratio: { label: "Talk ratio", range: "healthy range 50–70% (you, not them)" },
  longest_pause_ms: { label: "Longest pause", range: "under 3s reads as natural" },
};

function verdictFor(overall: number): string {
  if (overall >= 85) return "Strong performance — this would move forward.";
  if (overall >= 70) return "Solid, with room to tighten a few answers.";
  if (overall >= 55) return "Passable, but several answers need more depth.";
  return "Needs real practice before this stage is ready.";
}

// specs §7.4 — shared by /scorecard/[sessionId] (a real session's row) and
// /sample-scorecard (a fixture) so both render identically.
export function ScorecardView({
  overall,
  stars,
  xpAwarded,
  star,
  communication,
  strengths,
  improvements,
  modelAnswers,
  turns,
}: ScorecardViewProps) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 p-8">
      <section className="flex items-center gap-6">
        <ScoreRing score={overall} />
        <div className="flex flex-col gap-1">
          <div className="flex gap-1 text-xl" aria-label={`${stars} of 3 stars`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < stars ? "text-amber-500" : "text-zinc-300"}>
                ★
              </span>
            ))}
          </div>
          <p className="text-sm text-zinc-500">+{xpAwarded} XP</p>
          <p className="max-w-md font-medium">{verdictFor(overall)}</p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">STAR breakdown</h2>
        <StarRadar {...star} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Communication</h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-zinc-500">Clarity</dt>
            <dd className="text-lg font-medium">{communication.clarity}/100</dd>
          </div>
          {(Object.keys(REFERENCE_RANGES) as (keyof typeof REFERENCE_RANGES)[]).map((key) => {
            const { label, range } = REFERENCE_RANGES[key];
            const value = communication[key];
            const display =
              key === "talk_ratio"
                ? `${Math.round(value * 100)}%`
                : key === "longest_pause_ms"
                  ? `${(value / 1000).toFixed(1)}s`
                  : key === "pace_wpm"
                    ? `${Math.round(value)} wpm`
                    : `${value.toFixed(1)}`;
            return (
              <div key={key}>
                <dt className="text-sm text-zinc-500">{label}</dt>
                <dd className="text-lg font-medium">{display}</dd>
                <dd className="text-xs text-zinc-400">{range}</dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Strengths</h2>
        <ul className="flex flex-col gap-3">
          {strengths.map((s, i) => (
            <li key={i} className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="font-medium">{s.point}</p>
              <p className="text-sm italic text-zinc-500">&ldquo;{s.quote_from_answer}&rdquo;</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Improvements</h2>
        <ul className="flex flex-col gap-3">
          {improvements.map((imp, i) => (
            <li key={i} className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="font-medium">{imp.point}</p>
              <p className="text-sm text-zinc-500">{imp.why_it_matters}</p>
              <p className="text-sm">
                <span className="text-zinc-500">Say instead: </span>
                {imp.what_to_say_instead}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {modelAnswers.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium">Model answers</h2>
          <div className="flex flex-col gap-2">
            {modelAnswers.map((m, i) => (
              <details key={i} className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
                <summary className="cursor-pointer font-medium">{m.question}</summary>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{m.strong_answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">Full transcript</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {turns.map((t, i) => (
            <li key={i}>
              <strong>{t.role}:</strong> {t.transcript}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

import { ScoreRing } from "@/components/scorecard/ScoreRing";
import { DrillButton } from "@/components/roadmap/DrillButton";
import { STATUS_STYLE, StatusBadge } from "@/components/scorecard/StatusBadge";
import {
  answerStats,
  assessClarity,
  assessFillers,
  assessPace,
  assessPause,
  assessTalkRatio,
  formatClock,
  scoreStatus,
  timingIsReliable,
  wordCount,
  type Assessment,
  type TimedTurn,
} from "@/lib/metrics/assessment";

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
interface PerQuestionItem {
  question: string;
  bank_index: number;
  score: number;
  verdict: string;
}
interface Communication {
  clarity: number;
  pace_wpm: number;
  filler_rate: number;
  talk_ratio: number;
  longest_pause_ms: number;
}

export interface StageProgressInfo {
  passScore: number;
  /** null on the roadmap's last stage */
  nextStageTitle: string | null;
  /** earlier full-interview scores on this stage, oldest first */
  previousScores: number[];
}

export interface ScorecardViewProps {
  overall: number;
  stars: number;
  xpAwarded: number;
  star: { situation: number; task: number; action: number; result: number };
  relevance?: number;
  communication: Communication;
  strengths: StrengthItem[];
  improvements: ImprovementItem[];
  modelAnswers: ModelAnswerItem[];
  perQuestion?: PerQuestionItem[];
  turns: TimedTurn[];
  isDrill?: boolean;
  drillQuestion?: string | null;
  progress?: StageProgressInfo;
  /** enables "drill this question" on weak answers */
  stageId?: string;
  interviewerName?: string;
}

const STAR_THRESHOLDS = "★ 55+ · ★★ 70+ · ★★★ 85+";

const BREAKDOWN_HELP: Record<string, string> = {
  Situation: "Did you set the scene — where, when, what was at stake?",
  Task: "Was your own responsibility clear?",
  Action: "Did you say what you personally did?",
  Result: "Did you land a concrete, ideally measurable, outcome?",
  Relevance: "Did your answers match the question and the role?",
  Clarity: "Were your answers easy to follow?",
};

function verdictFor(overall: number): string {
  if (overall >= 85) return "Strong performance — this would move forward.";
  if (overall >= 70) return "Solid, with room to tighten a few answers.";
  if (overall >= 55) return "Passable, but several answers need more depth.";
  return "Needs real practice before this stage is ready.";
}

// specs §7.4 — shared by /scorecard/[sessionId] (a real session's row) and
// /sample-scorecard (a fixture) so both render identically. Everything past
// the Gemini-written text is derived here from data already stored: the pass
// mark and next stage, earlier attempts, the turn timings.
export function ScorecardView({
  overall,
  stars,
  xpAwarded,
  star,
  relevance,
  communication,
  strengths,
  improvements,
  modelAnswers,
  perQuestion = [],
  turns,
  isDrill,
  drillQuestion,
  progress,
  stageId,
  interviewerName = "Interviewer",
}: ScorecardViewProps) {
  const reliableTiming = timingIsReliable(turns);
  const stats = answerStats(turns, reliableTiming);

  const breakdown: { label: string; value: number }[] = [
    { label: "Situation", value: star.situation },
    { label: "Task", value: star.task },
    { label: "Action", value: star.action },
    { label: "Result", value: star.result },
    ...(relevance !== undefined ? [{ label: "Relevance", value: relevance }] : []),
    { label: "Clarity", value: communication.clarity },
  ];

  const delivery: { label: string; value: string; assessment: Assessment; timing: boolean }[] = [
    { label: "Pace", value: `${Math.round(communication.pace_wpm)} wpm`, assessment: assessPace(communication.pace_wpm), timing: true },
    { label: "Filler words", value: `${communication.filler_rate.toFixed(1)} per 100 words`, assessment: assessFillers(communication.filler_rate), timing: false },
    { label: "Talk ratio", value: `${Math.round(communication.talk_ratio * 100)}% you`, assessment: assessTalkRatio(communication.talk_ratio), timing: true },
    { label: "Longest pause before answering", value: `${(communication.longest_pause_ms / 1000).toFixed(1)}s`, assessment: assessPause(communication.longest_pause_ms), timing: true },
    { label: "Clarity", value: `${communication.clarity}/100`, assessment: assessClarity(communication.clarity), timing: false },
  ];
  const shownDelivery = delivery.filter((d) => reliableTiming || !d.timing);

  return (
    <div className="flex flex-col gap-10">
      {isDrill && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 dark:border-amber-500/20 dark:bg-amber-950/20">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              ⚡ Targeted question drill
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Practice only — earns XP, doesn&apos;t count toward stage progress
            </span>
          </div>
          {drillQuestion && (
            <p className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              &ldquo;{drillQuestion}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* ── Headline ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-6">
          <ScoreRing score={overall} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <div className="flex gap-1 text-xl" aria-label={`${stars} of 3 stars`}>
                {[0, 1, 2].map((i) => (
                  // zinc-300 alone is near-white on the dark theme, so an unearned
                  // star read as an earned one — a 28/100 scorecard showed ★★★.
                  <span key={i} className={i < stars ? "text-amber-500" : "text-zinc-300 dark:text-zinc-700"}>
                    ★
                  </span>
                ))}
              </div>
              <span className="text-xs text-zinc-500">{STAR_THRESHOLDS}</span>
            </div>
            <p className="font-medium">{verdictFor(overall)}</p>
            <p className="text-sm text-zinc-500">
              +{xpAwarded} XP
              {stats.answers > 0 &&
                ` · ${stats.answers} answer${stats.answers === 1 ? "" : "s"}, ~${stats.avgWords} words ${stats.answers === 1 ? "long" : "each"}`}
            </p>
          </div>
        </div>

        {progress && !isDrill && <PassMeter overall={overall} progress={progress} />}
      </section>

      {/* ── Breakdown ──────────────────────────────────────────── */}
      <section>
        <SectionTitle title="Score breakdown" hint="0–100 per dimension. Hover a row for what it measures." />
        <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {breakdown.map(({ label, value }) => (
            <li key={label} title={BREAKDOWN_HELP[label]} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
                <span className="font-semibold tabular-nums">{Math.round(value)}</span>
              </div>
              <div className="h-2 rounded bg-blue-100 dark:bg-blue-950">
                <div
                  className="h-2 rounded bg-[#2563eb]"
                  style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Per question ───────────────────────────────────────── */}
      {perQuestion.length > 0 && (
        <section>
          <SectionTitle title="Question by question" hint="How each answer landed on its own." />
          <ul className="flex flex-col gap-2">
            {perQuestion.map((q, i) => {
              const status = scoreStatus(q.score);
              const canDrill = Boolean(stageId) && !isDrill && q.bank_index >= 0 && status !== "good";
              return (
                <li
                  key={i}
                  className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 sm:flex-row sm:items-start dark:border-zinc-800"
                >
                  <span
                    className={`flex w-fit shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-sm font-semibold tabular-nums ${STATUS_STYLE[status].chip}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[status].dot}`} aria-hidden />
                    {q.score}
                    <span className="sr-only">{STATUS_STYLE[status].label}</span>
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="font-medium">{q.question}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">{q.verdict}</p>
                  </div>
                  {canDrill && (
                    <DrillButton stageId={stageId!} questionIndex={q.bank_index} label="⚡ Drill this (2 min)" />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Delivery ───────────────────────────────────────────── */}
      <section>
        <SectionTitle title="Delivery" hint="Measured from the recording, not judged by the model." />
        {!reliableTiming && turns.length > 0 && (
          <p className="mb-3 rounded-lg border border-zinc-200 p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            Pace, talk ratio and pauses aren&apos;t shown: this interview was recorded before a fix
            to how turn timings are captured, and its timings aren&apos;t accurate. Interviews from
            now on include them.
          </p>
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {shownDelivery.map(({ label, value, assessment }) => (
            <li key={label} className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm text-zinc-500">{label}</span>
                <StatusBadge status={assessment.status} />
              </div>
              <span className="text-lg font-semibold">{value}</span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{assessment.advice}</span>
            </li>
          ))}
          {reliableTiming && stats.longestAnswerSeconds !== null && (
            <li className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <span className="text-sm text-zinc-500">Longest answer</span>
              <span className="text-lg font-semibold">{formatClock(stats.longestAnswerSeconds * 1000)}</span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Most strong answers land in 1–2 minutes.
              </span>
            </li>
          )}
        </ul>
      </section>

      {strengths.length > 0 && (
        <section>
          <SectionTitle title="What worked" />
          <ul className="flex flex-col gap-3">
            {strengths.map((s, i) => (
              <li key={i} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="font-medium">
                  <span className="mr-1.5 text-[#0ca30c]" aria-hidden>
                    ✓
                  </span>
                  {s.point}
                </p>
                <p className="mt-1 text-sm italic text-zinc-500">&ldquo;{s.quote_from_answer}&rdquo;</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionTitle title="What to fix" />
        <ul className="flex flex-col gap-3">
          {improvements.map((imp, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="font-medium">{imp.point}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{imp.why_it_matters}</p>
              <p className="rounded-md bg-zinc-100 p-2.5 text-sm dark:bg-zinc-900">
                <span className="mb-0.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Try saying
                </span>
                {imp.what_to_say_instead}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {modelAnswers.length > 0 && (
        <section>
          <SectionTitle title="Model answers" hint="Built from your own CV. Tap a question to open it." />
          <div className="flex flex-col gap-2">
            {modelAnswers.map((m, i) => (
              <details key={i} className="group rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <summary className="cursor-pointer list-none font-medium">
                  <span className="mr-1.5 inline-block text-zinc-400 transition-transform group-open:rotate-90">▸</span>
                  {m.question}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{m.strong_answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle title="Transcript" />
        <ol className="flex flex-col gap-3 text-sm">
          {turns.map((t, i) => {
            const isCandidate = t.role === "candidate";
            const words = wordCount(t.transcript);
            const seconds =
              reliableTiming && t.start_ms !== undefined && t.end_ms !== undefined
                ? (t.end_ms - t.start_ms) / 1000
                : null;
            return (
              <li key={i} className={`flex flex-col gap-1 ${isCandidate ? "items-end" : "items-start"}`}>
                <span className="text-xs text-zinc-500">
                  {isCandidate ? "You" : interviewerName}
                  {reliableTiming && t.start_ms !== undefined && ` · ${formatClock(t.start_ms)}`}
                  {isCandidate && ` · ${words} words`}
                  {isCandidate && seconds !== null && ` in ${Math.round(seconds)}s`}
                </span>
                <p
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 leading-relaxed ${
                    isCandidate
                      ? "rounded-br-sm bg-blue-600 text-white"
                      : "rounded-bl-sm bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  }`}
                >
                  {t.transcript}
                </p>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 flex flex-col gap-0.5">
      <h2 className="text-lg font-medium">{title}</h2>
      {hint && <p className="text-sm text-zinc-500">{hint}</p>}
    </div>
  );
}

// Where this score sits against the stage's pass mark, and what that means:
// the skill tree's unlock rule (specs §8.2) made visible on the page that
// decides it.
function PassMeter({ overall, progress }: { overall: number; progress: StageProgressInfo }) {
  const { passScore, nextStageTitle, previousScores } = progress;
  const passed = overall >= passScore;
  const gap = passScore - overall;
  const best = previousScores.length ? Math.max(...previousScores) : null;
  const last = previousScores.at(-1) ?? null;
  const attempt = previousScores.length + 1;

  const headline = passed
    ? nextStageTitle
      ? `Passed — ${nextStageTitle} is unlocked.`
      : "Passed — that was the final stage."
    : `${gap} point${gap === 1 ? "" : "s"} below the pass mark${nextStageTitle ? ` — ${nextStageTitle} stays locked` : ""}.`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          <span className={`mr-1.5 ${passed ? "text-[#0ca30c]" : "text-[#d03b3b]"}`} aria-hidden>
            {passed ? "✓" : "✕"}
          </span>
          {headline}
        </p>
        <span className="text-sm text-zinc-500">Pass mark {passScore}</span>
      </div>

      <div className="relative h-2.5 rounded bg-zinc-200 dark:bg-zinc-800" title={`${overall} / pass mark ${passScore}`}>
        <div
          className={`h-2.5 rounded ${passed ? "bg-[#0ca30c]" : "bg-[#d03b3b]"}`}
          style={{ width: `${Math.max(0, Math.min(100, overall))}%` }}
        />
        <div
          className="absolute -top-1 h-4.5 w-0.5 bg-zinc-900 dark:bg-zinc-100"
          style={{ left: `${passScore}%` }}
          aria-hidden
        />
      </div>

      <p className="text-sm text-zinc-500">
        Attempt {attempt}
        {last !== null && (
          <>
            {" "}· last time {last} ({overall - last >= 0 ? "+" : ""}
            {overall - last})
          </>
        )}
        {best !== null && ` · previous best ${best}`}
        {previousScores.length > 0 && ` · history ${[...previousScores, overall].join(" → ")}`}
      </p>
    </div>
  );
}

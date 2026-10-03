import type { Turn } from "@/lib/metrics/deterministic";

// specs §7.1 — builds turns whose timestamps come from when people actually
// spoke, not from when their transcription happened to arrive.
//
// That distinction is the whole point of this module. Turns used to be
// stamped with the arrival time of their first transcription delta, but the
// Live API delivers the candidate's input transcription late — in practice
// right as the interviewer starts replying. A real 7-minute session came out
// with every candidate turn starting within a millisecond of the interviewer
// turn beside it (6699 vs 6700, 156922 vs 156923), so every pause before an
// answer was negative (the scorecard showed "longest pause 0.0s"), and a
// 112-word answer was timed at 4.6s — which made pace and talk ratio fiction.
//
// Timing now comes from audio, and transcription only supplies the words:
// - candidate: start/end from the local energy VAD in lib/audio/recorder.ts
// - interviewer: start when its first audio chunk is scheduled to play, end
//   when the last scheduled chunk finishes (or the moment it was interrupted)
//
// Because the candidate's words arrive after they've stopped talking, their
// answer is frozen when the interviewer starts replying and only committed
// when that reply ends — by which point its transcription has arrived. Any
// transcription that arrives while the interviewer is playing belongs to the
// frozen answer.
//
// All times are ms since session start. Pure — no DOM, no audio — so the
// event sequences it has to survive can be exercised offline.

interface Pending {
  text: string;
  start: number | null;
  end: number | null;
  firstTextAt: number | null;
}

const empty = (): Pending => ({ text: "", start: null, end: null, firstTextAt: null });

export class TurnTimeline {
  private committed: Turn[] = [];
  private candidate = empty();
  private frozenCandidate: Pending | null = null;
  private interviewer = empty();
  private interviewerPlaying = false;
  // Audio is generated faster than it plays, so turnComplete can arrive while
  // the reply is still coming out of the speakers. Until then, mic energy is
  // far more likely to be the reply leaking back in than the candidate.
  private playbackUntil = 0;

  private readonly onCommit?: (turn: Turn) => void;

  constructor(onCommit?: (turn: Turn) => void) {
    this.onCommit = onCommit;
  }

  candidateSpeechStart(t: number) {
    // Speech over the interviewer is either echo or a barge-in; a real
    // barge-in arrives separately as interviewerInterrupted().
    if (this.interviewerPlaying || t < this.playbackUntil) return;
    if (this.candidate.start === null) this.candidate.start = t;
  }

  candidateSpeechEnd(t: number) {
    if (this.candidate.start !== null) this.candidate.end = t;
  }

  candidateText(t: number, text: string) {
    const target = this.frozenCandidate ?? this.candidate;
    target.firstTextAt ??= t;
    target.text += text;
  }

  interviewerText(t: number, text: string) {
    this.interviewer.firstTextAt ??= t;
    this.interviewer.text += text;
  }

  /** `playAt` is when this chunk is scheduled to start playing. */
  interviewerAudio(playAt: number) {
    if (this.interviewerPlaying) return;
    this.interviewerPlaying = true;
    this.interviewer.start ??= playAt;
    // The reply has started, so the answer it's replying to is over.
    this.frozenCandidate = { ...this.candidate, end: this.candidate.end ?? playAt };
    this.candidate = empty();
  }

  /** turnComplete. `playbackEndsAt` is when the last scheduled chunk ends. */
  interviewerTurnEnd(playbackEndsAt: number) {
    this.closeExchange(playbackEndsAt);
    this.playbackUntil = playbackEndsAt;
  }

  /** Barge-in: playback was cut at `t`, and the candidate is speaking now. */
  interviewerInterrupted(t: number) {
    this.closeExchange(t);
    this.playbackUntil = 0;
    this.candidate.start = t;
  }

  /** Session end: commit everything still open. */
  finish(t: number): Turn[] {
    this.closeExchange(t);
    this.commit("candidate", this.candidate, this.candidate.end ?? t);
    this.candidate = empty();
    return this.turns();
  }

  /** Committed turns plus whatever is still in flight, without committing
   * it — for periodic and tab-close flushes, which mustn't lose an answer
   * that's waiting on its transcription. */
  snapshot(t: number): Turn[] {
    const inFlight = [
      this.frozenCandidate && toTurn("candidate", this.frozenCandidate, t),
      toTurn("interviewer", this.interviewer, t),
      toTurn("candidate", this.candidate, this.candidate.end ?? t),
    ].filter((turn): turn is Turn => turn !== null);
    return chronological([...this.committed, ...inFlight]);
  }

  turns(): Turn[] {
    return chronological(this.committed);
  }

  private closeExchange(t: number) {
    if (this.frozenCandidate) {
      this.commit("candidate", this.frozenCandidate, t);
      this.frozenCandidate = null;
    }
    this.commit("interviewer", this.interviewer, t);
    this.interviewer = empty();
    this.interviewerPlaying = false;
  }

  private commit(role: Turn["role"], pending: Pending, fallbackEnd: number) {
    const turn = toTurn(role, pending, fallbackEnd);
    if (!turn) return;
    this.committed.push(turn);
    this.onCommit?.(turn);
  }
}

function toTurn(role: Turn["role"], pending: Pending, fallbackEnd: number): Turn | null {
  if (!pending.text.trim()) return null;
  // No VAD span (e.g. a mic too quiet for the energy threshold): fall back to
  // the old arrival-based start rather than dropping the words.
  const start = pending.start ?? pending.firstTextAt ?? fallbackEnd;
  const end = Math.max(pending.end ?? fallbackEnd, start);
  return {
    role,
    transcript: pending.text.trim(),
    start_ms: Math.round(start),
    end_ms: Math.round(end),
  };
}

function chronological(turns: Turn[]): Turn[] {
  return [...turns].sort((a, b) => a.start_ms - b.start_ms);
}

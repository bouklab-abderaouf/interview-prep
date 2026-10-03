import { describe, expect, it, vi } from "vitest";

import { TurnTimeline } from "@/lib/live/turn-timeline";

// These are the event orders the Live API actually produces. The one that
// motivated the module: the candidate's transcription arrives *after* the
// interviewer has started replying, so timing must come from audio.
describe("TurnTimeline", () => {
  it("times a candidate answer from the VAD, not from its late transcription", () => {
    const timeline = new TurnTimeline();

    timeline.interviewerText(0, "Tell me about yourself.");
    timeline.interviewerAudio(100);
    timeline.interviewerTurnEnd(3_000);

    timeline.candidateSpeechStart(4_000);
    timeline.candidateSpeechEnd(10_000);
    // Reply starts, and only then does the candidate's transcription land.
    timeline.interviewerAudio(11_000);
    timeline.candidateText(11_001, "I build RAG systems.");
    timeline.interviewerText(11_002, "Interesting.");
    timeline.interviewerTurnEnd(13_000);

    expect(timeline.turns()).toEqual([
      { role: "interviewer", transcript: "Tell me about yourself.", start_ms: 100, end_ms: 3_000 },
      { role: "candidate", transcript: "I build RAG systems.", start_ms: 4_000, end_ms: 10_000 },
      { role: "interviewer", transcript: "Interesting.", start_ms: 11_000, end_ms: 13_000 },
    ]);
  });

  it("never produces a negative pause before an answer", () => {
    const timeline = new TurnTimeline();
    timeline.interviewerText(0, "Q1");
    timeline.interviewerAudio(0);
    timeline.interviewerTurnEnd(2_000);
    timeline.candidateSpeechStart(2_500);
    timeline.candidateSpeechEnd(5_000);
    timeline.interviewerAudio(5_500);
    timeline.candidateText(5_501, "A1");
    timeline.interviewerText(5_502, "Q2");
    timeline.interviewerTurnEnd(7_000);

    const [q1, a1] = timeline.turns();
    expect(a1.start_ms - q1.end_ms).toBeGreaterThanOrEqual(0);
  });

  it("ignores mic energy while the reply is still playing (echo)", () => {
    const timeline = new TurnTimeline();
    timeline.interviewerText(0, "Question");
    timeline.interviewerAudio(0);
    // turnComplete arrives early; audio keeps playing until 5s.
    timeline.interviewerTurnEnd(5_000);
    timeline.candidateSpeechStart(4_000); // echo of the reply
    timeline.candidateSpeechStart(6_000); // the real answer
    timeline.candidateSpeechEnd(8_000);
    timeline.candidateText(8_100, "Answer");

    const turns = timeline.finish(9_000);
    expect(turns[1]).toMatchObject({ role: "candidate", start_ms: 6_000, end_ms: 8_000 });
  });

  it("cuts the interviewer at a barge-in and starts the candidate there", () => {
    const timeline = new TurnTimeline();
    timeline.interviewerText(0, "A very long question that");
    timeline.interviewerAudio(0);
    timeline.interviewerInterrupted(2_500);
    timeline.candidateText(2_600, "Sorry, can I stop you there");
    timeline.candidateSpeechEnd(4_000);

    const turns = timeline.finish(5_000);
    expect(turns).toEqual([
      { role: "interviewer", transcript: "A very long question that", start_ms: 0, end_ms: 2_500 },
      { role: "candidate", transcript: "Sorry, can I stop you there", start_ms: 2_500, end_ms: 4_000 },
    ]);
  });

  it("falls back to the transcription arrival time when the VAD heard nothing", () => {
    const timeline = new TurnTimeline();
    timeline.candidateText(1_234, "quiet answer");
    expect(timeline.finish(2_000)).toEqual([
      { role: "candidate", transcript: "quiet answer", start_ms: 1_234, end_ms: 2_000 },
    ]);
  });

  it("drops turns with no words", () => {
    const timeline = new TurnTimeline();
    timeline.candidateSpeechStart(0);
    timeline.candidateSpeechEnd(1_000);
    timeline.candidateText(1_100, "   ");
    expect(timeline.finish(2_000)).toEqual([]);
  });

  it("includes in-flight turns in a snapshot without committing them", () => {
    const onCommit = vi.fn();
    const timeline = new TurnTimeline(onCommit);
    timeline.interviewerText(0, "Q");
    timeline.interviewerAudio(0);
    timeline.interviewerTurnEnd(1_000);
    expect(onCommit).toHaveBeenCalledTimes(1);

    timeline.candidateSpeechStart(1_500);
    timeline.candidateText(1_600, "half an answer");

    const snapshot = timeline.snapshot(3_000);
    expect(snapshot.map((t) => t.transcript)).toEqual(["Q", "half an answer"]);
    expect(timeline.turns()).toHaveLength(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("keeps the frozen answer in a snapshot taken mid-reply", () => {
    const timeline = new TurnTimeline();
    timeline.candidateSpeechStart(0);
    timeline.candidateSpeechEnd(2_000);
    timeline.interviewerAudio(2_500);
    timeline.candidateText(2_600, "my answer");
    timeline.interviewerText(2_700, "the reply");

    expect(timeline.snapshot(3_000).map((t) => [t.role, t.transcript])).toEqual([
      ["candidate", "my answer"],
      ["interviewer", "the reply"],
    ]);
  });

  it("returns turns in chronological order", () => {
    const timeline = new TurnTimeline();
    timeline.candidateSpeechStart(0);
    timeline.candidateSpeechEnd(1_000);
    timeline.interviewerAudio(1_500);
    timeline.interviewerText(1_501, "reply");
    timeline.candidateText(1_502, "answer");
    const turns = timeline.finish(3_000);
    const starts = turns.map((t) => t.start_ms);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

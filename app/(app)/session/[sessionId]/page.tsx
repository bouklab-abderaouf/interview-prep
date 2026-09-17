"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@google/genai";

import { startRecording, type AudioRecorderHandle } from "@/lib/audio/recorder";
import { describeMicError, requestMicrophone } from "@/lib/audio/mic";
import { createAudioPlayer, type AudioPlayerHandle } from "@/lib/audio/player";
import { connectLiveSession, sendAudioChunk } from "@/lib/live/client";
import type { TokenResponseBody } from "@/lib/live/types";
import type { Turn } from "@/lib/metrics/deterministic";
import { createClient } from "@/lib/supabase/client";
import { InterviewRoom } from "@/components/interview/InterviewRoom";

// Phase 0 §4 walking-skeleton harness, extended in Phase 3 (§7.1) into the
// real interview room when a stageId is present: mode: 'full', turn capture,
// and end-of-session scoring. Without a stageId this stays the original
// unguarded connectivity smoke test — no CV data, no stage-specific prompt.

type Status = "idle" | "connecting" | "connected" | "scoring" | "error";

interface TranscriptLine {
  role: "candidate" | "interviewer";
  text: string;
}

interface TurnAccumulator {
  text: string;
  startMs: number | null;
}

const FLUSH_INTERVAL_MS = 60_000;
// How long to wait after the candidate stops talking before flagging that
// the interviewer seems stuck — found from a real bug: the Live API can go
// silent with zero error (no close event, no audio, nothing) when its
// free-tier quota is exhausted, confirmed by bisecting against the live API
// with the exact same config that worked moments earlier. Without this, that
// state is indistinguishable from the app being broken.
const RESPONSE_WATCHDOG_MS = 12_000;

export default function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const searchParams = useSearchParams();
  const stageId = searchParams.get("stageId");
  const isRealSession = Boolean(stageId);
  const isDrillParam = searchParams.get("drill") === "true";
  const qIndexParam = searchParams.get("qIndex");
  const parsedQIndex = qIndexParam ? parseInt(qIndexParam, 10) : undefined;
  const router = useRouter();

  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stalledWarning, setStalledWarning] = useState<string | null>(null);
  // Set when scoring failed on a session whose turns are safely persisted, so
  // the UI can offer to run it again instead of losing the interview.
  const [scoringRecoverable, setScoringRecoverable] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [ttfaSamples, setTtfaSamples] = useState<number[]>([]);
  const [lastTtfa, setLastTtfa] = useState<number | null>(null);
  const [isCandidateSpeaking, setIsCandidateSpeaking] = useState(false);
  const [isInterviewerSpeaking, setIsInterviewerSpeaking] = useState(false);
  const interviewerSpeakingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [drillInfo, setDrillInfo] = useState<{
    isDrill: boolean;
    targetQuestion?: string | null;
    targets?: string | null;
    questionIndex?: number;
  }>({
    isDrill: isDrillParam,
    questionIndex: parsedQIndex,
  });

  const [stageInfo, setStageInfo] = useState<{
    title: string;
    targetRole?: string;
    company?: string | null;
    persona: {
      name: string;
      role: string;
      tone: "warm" | "neutral" | "skeptical";
      strictness: number;
    };
  } | null>(null);

  useEffect(() => {
    if (!stageId) return;
    const supabase = createClient();
    async function loadStage() {
      const { data: stage } = await supabase
        .from("stages")
        .select("id, title, persona, roadmap_id, question_bank")
        .eq("id", stageId!)
        .maybeSingle<{
          id: string;
          title: string;
          persona: {
            name: string;
            role: string;
            tone: "warm" | "neutral" | "skeptical";
            strictness: number;
          };
          roadmap_id: string;
          question_bank: Array<{ text: string; targets: string }> | null;
        }>();

      const { data: sessionRow } = await supabase
        .from("sessions")
        .select("usage")
        .eq("id", sessionId)
        .maybeSingle<{
          usage: {
            drill?: boolean;
            targetQuestion?: string | null;
            targets?: string | null;
            questionIndex?: number;
          } | null;
        }>();

      const isDrill = Boolean(sessionRow?.usage?.drill || isDrillParam);
      const qIndex = sessionRow?.usage?.questionIndex ?? parsedQIndex;
      const targetQ =
        sessionRow?.usage?.targetQuestion ??
        (stage?.question_bank && qIndex !== undefined ? stage.question_bank[qIndex]?.text : null);
      const targetProbe =
        sessionRow?.usage?.targets ??
        (stage?.question_bank && qIndex !== undefined ? stage.question_bank[qIndex]?.targets : null);

      if (isDrill) {
        setDrillInfo({
          isDrill: true,
          targetQuestion: targetQ,
          targets: targetProbe,
          questionIndex: qIndex,
        });
      }

      if (stage) {
        const { data: roadmap } = await supabase
          .from("roadmaps")
          .select("target_role, company")
          .eq("id", stage.roadmap_id)
          .maybeSingle<{ target_role: string; company: string | null }>();

        setStageInfo({
          title: stage.title,
          targetRole: roadmap?.target_role,
          company: roadmap?.company,
          persona: stage.persona,
        });
      }
    }
    void loadStage();
  }, [stageId, sessionId, isDrillParam, parsedQIndex]);

  const sessionRef = useRef<Session | null>(null);
  const recorderRef = useRef<AudioRecorderHandle | null>(null);
  // Held separately from the recorder: the mic is acquired before the recorder
  // exists, so a failure in between (token, connect) would otherwise leave the
  // browser's recording indicator on with nothing owning the tracks.
  const micStreamRef = useRef<MediaStream | null>(null);
  const playerRef = useRef<AudioPlayerHandle | null>(null);
  const activityEndAtRef = useRef<number | null>(null);
  const awaitingFirstAudioRef = useRef(false);
  const responseWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against onClose's own status update racing (and clobbering)
  // stop()'s flush/score sequence — both run when a session ends, since
  // closing the Live session triggers the WebSocket's close event
  // asynchronously while stop() keeps executing past that point.
  const endingRef = useRef(false);

  // Turn capture (specs §7.1) — only meaningful for a real session.
  const sessionStartRef = useRef<number | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  const candidateAccRef = useRef<TurnAccumulator>({ text: "", startMs: null });
  const interviewerAccRef = useRef<TurnAccumulator>({ text: "", startMs: null });
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const appendTranscript = useCallback((line: TranscriptLine) => {
    setTranscript((prev) => [...prev, line]);
  }, []);

  // Moves whatever's been accumulated for a role into a finished turn. Called
  // both opportunistically from a transcription chunk marked `finished`
  // (unverified in practice whether the API reliably sets this) and — the
  // mechanism this now actually depends on — from turn-boundary signals
  // already proven to fire: activity-end for the candidate, turnComplete for
  // the interviewer. The startMs === null guard makes calling this from
  // multiple triggers for the same turn safe: whichever fires first flushes
  // and resets the accumulator, so a later trigger for the same turn is a
  // harmless no-op instead of a duplicate push.
  const flushAccumulatedTurn = useCallback(
    (role: "interviewer" | "candidate", accRef: React.RefObject<TurnAccumulator>) => {
      if (accRef.current.startMs === null || !accRef.current.text.trim()) return;
      const now = performance.now();
      const sessionStart = sessionStartRef.current ?? now;
      const turn: Turn = {
        role,
        transcript: accRef.current.text,
        start_ms: Math.round(accRef.current.startMs),
        end_ms: Math.round(now - sessionStart),
      };
      turnsRef.current.push(turn);
      accRef.current = { text: "", startMs: null };
      appendTranscript({ role, text: turn.transcript });
    },
    [appendTranscript],
  );

  // Shared by the server's real voiceActivityDetectionSignal (allowlist-gated,
  // usually silent — see lib/live/client.ts) and the local energy-based
  // fallback (lib/audio/recorder.ts). Whichever fires first per turn wins;
  // the guard stops a same-turn duplicate from resetting the anchor later
  // than the true end of speech.
  const markActivityEnd = useCallback(() => {
    if (awaitingFirstAudioRef.current) return;
    activityEndAtRef.current = performance.now();
    awaitingFirstAudioRef.current = true;
  }, []);

  // Starts a timer when the candidate stops talking; if no reply audio shows
  // up before it fires, surfaces a visible warning instead of leaving the
  // UI looking broken with no explanation.
  const startResponseWatchdog = useCallback(() => {
    if (responseWatchdogRef.current) clearTimeout(responseWatchdogRef.current);
    responseWatchdogRef.current = setTimeout(() => {
      setStalledWarning(
        "No response yet after 12s. This is usually a transient Live API issue or a free-tier quota limit, not a problem with your answer — check the console, or try again in a bit.",
      );
    }, RESPONSE_WATCHDOG_MS);
  }, []);

  const clearResponseWatchdog = useCallback(() => {
    if (responseWatchdogRef.current) clearTimeout(responseWatchdogRef.current);
    responseWatchdogRef.current = null;
    setStalledWarning(null);
  }, []);

  // If speech resumes before any reply audio arrived, the pending anchor was
  // a false positive (a mid-sentence pause past SILENCE_HANGOVER_MS, not a
  // real end of turn) — drop it so a stale timestamp doesn't inflate the next
  // real TTFA sample. No-op if a reply already arrived, since onAudioChunk
  // clears awaitingFirstAudioRef the moment audio actually shows up.
  const cancelPendingActivityEnd = useCallback(() => {
    awaitingFirstAudioRef.current = false;
    activityEndAtRef.current = null;
    clearResponseWatchdog();
  }, [clearResponseWatchdog]);

  // inputAudioTranscription/outputAudioTranscription arrive as incremental
  // deltas, not the full turn text — concatenate until `finished`, then
  // record start_ms (first chunk) / end_ms (finished chunk) relative to
  // session start (specs §3 turns.start_ms/end_ms: "ms since session start").
  const captureTranscriptChunk = useCallback(
    (role: "interviewer" | "candidate", accRef: React.RefObject<TurnAccumulator>, text: string, finished: boolean) => {
      const now = performance.now();
      const sessionStart = sessionStartRef.current ?? now;
      if (accRef.current.startMs === null) {
        accRef.current.startMs = now - sessionStart;
      }
      accRef.current.text += text;
      if (finished) flushAccumulatedTurn(role, accRef);
    },
    [flushAccumulatedTurn],
  );

  const flushTurns = useCallback(
    async (status?: "completed" | "abandoned" | "errored", keepalive = false) => {
      if (!isRealSession) return;
      try {
        await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turns: turnsRef.current, ...(status ? { status } : {}) }),
          keepalive,
        });
      } catch (error) {
        console.error("[session] flush failed", error);
      }
    },
    [isRealSession, sessionId],
  );

  // beforeunload can't await a normal fetch, but `keepalive: true` lets the
  // browser finish the request after the page starts unloading — the same
  // guarantee navigator.sendBeacon gives, without sendBeacon's POST-only
  // restriction (this needs PATCH).
  useEffect(() => {
    if (!isRealSession) return;
    const handler = () => {
      void flushTurns("abandoned", true);
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isRealSession, flushTurns]);

  useEffect(() => {
    return () => {
      if (responseWatchdogRef.current) clearTimeout(responseWatchdogRef.current);
    };
  }, []);

  const stop = useCallback(async () => {
    endingRef.current = true;
    clearResponseWatchdog();
    if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
    flushIntervalRef.current = null;
    setIsCandidateSpeaking(false);
    setIsInterviewerSpeaking(false);
    if (interviewerSpeakingTimeoutRef.current) {
      clearTimeout(interviewerSpeakingTimeoutRef.current);
    }
    // Flush whatever's still mid-turn (e.g. the interviewer was talking when
    // the user hit Stop) before it's lost.
    flushAccumulatedTurn("candidate", candidateAccRef);
    flushAccumulatedTurn("interviewer", interviewerAccRef);
    recorderRef.current?.stop();
    recorderRef.current = null;
    // stop() on the recorder already stops these tracks; this covers the case
    // where the mic was granted but the recorder never got built.
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    playerRef.current?.close();
    playerRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;

    if (isRealSession && turnsRef.current.length > 0) {
      setStatus("scoring");
      await flushTurns("completed");
      try {
        const res = await fetch(`/api/sessions/${sessionId}/score`, { method: "POST" });
        if (!res.ok) throw new Error(`score endpoint returned ${res.status}`);
        router.push(`/scorecard/${sessionId}`);
        return;
      } catch (error) {
        console.error("[session] scoring failed", error);
        // The turns are already flushed and the session is marked completed,
        // so this is recoverable — surface the retry rather than stranding a
        // finished interview behind a console message.
        setErrorMessage(
          "Your interview was saved, but scoring failed — usually the model being briefly overloaded.",
        );
        setScoringRecoverable(true);
        setStatus("error");
        return;
      }
    }

    setStatus("idle");
  }, [isRealSession, sessionId, flushTurns, flushAccumulatedTurn, clearResponseWatchdog, router]);

  const start = useCallback(async () => {
    setErrorMessage(null);
    setScoringRecoverable(false);
    clearResponseWatchdog();
    setStatus("connecting");
    endingRef.current = false;
    sessionStartRef.current = performance.now();
    turnsRef.current = [];
    candidateAccRef.current = { text: "", startMs: null };
    interviewerAccRef.current = { text: "", startMs: null };

    // The microphone comes first, before a token is minted or the Live socket
    // is opened. Asking last meant a blocked mic still spent a Live API
    // session — the scarcest thing in this app on the free tier — and then
    // threw a bare NotAllowedError into the console.
    let micStream: MediaStream;
    try {
      micStream = await requestMicrophone();
      micStreamRef.current = micStream;
    } catch (error) {
      console.error("[session start] mic permission failed", error);
      setErrorMessage(describeMicError(error));
      setStatus("error");
      return;
    }

    try {
      const tokenRes = await fetch("/api/live/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRealSession
            ? {
                mode: "full",
                stageId,
                drill: drillInfo.isDrill,
                questionIndex: drillInfo.questionIndex,
              }
            : { mode: "full" },
        ),
      });

      if (!tokenRes.ok) {
        throw new Error(`token endpoint returned ${tokenRes.status}`);
      }

      const tokenBody: TokenResponseBody = await tokenRes.json();
      const player = createAudioPlayer();
      playerRef.current = player;

      const session = await connectLiveSession(tokenBody, {
        onOpen: () => console.log("[live session] websocket open"),

        onSetupComplete: () => {
          setStatus("connected");
          if (isRealSession) {
            flushIntervalRef.current = setInterval(() => void flushTurns(), FLUSH_INTERVAL_MS);
          }
        },

        onAudioChunk: (chunk) => {
          player.enqueue(chunk);
          clearResponseWatchdog();
          setIsInterviewerSpeaking(true);
          if (interviewerSpeakingTimeoutRef.current) {
            clearTimeout(interviewerSpeakingTimeoutRef.current);
          }
          interviewerSpeakingTimeoutRef.current = setTimeout(() => {
            setIsInterviewerSpeaking(false);
          }, 450);

          if (awaitingFirstAudioRef.current && activityEndAtRef.current !== null) {
            const ttfa = performance.now() - activityEndAtRef.current;
            awaitingFirstAudioRef.current = false;
            activityEndAtRef.current = null;
            setLastTtfa(ttfa);
            setTtfaSamples((prev) => [...prev, ttfa]);
          }
        },

        onActivityEnd: () => {
          markActivityEnd();
          startResponseWatchdog();
          // The reliable turn-boundary signal for the candidate — see
          // flushAccumulatedTurn's comment on why this doesn't depend on
          // the transcription API's own `finished` flag actually firing.
          flushAccumulatedTurn("candidate", candidateAccRef);
        },

        onTurnComplete: () => {
          setIsInterviewerSpeaking(false);
          flushAccumulatedTurn("interviewer", interviewerAccRef);
        },

        onInterrupted: () => {
          player.interrupt();
          setIsInterviewerSpeaking(false);
        },

        onInputTranscript: (text, finished) => {
          console.log("[candidate]", text, finished ? "(final)" : "");
          captureTranscriptChunk("candidate", candidateAccRef, text, finished);
        },

        onOutputTranscript: (text, finished) => {
          console.log("[interviewer]", text, finished ? "(final)" : "");
          captureTranscriptChunk("interviewer", interviewerAccRef, text, finished);
        },

        onError: (error) => {
          console.error("[live session] error", error);
          clearResponseWatchdog();
          setIsInterviewerSpeaking(false);
          setErrorMessage(String(error));
          setStatus("error");
        },

        onClose: (info) => {
          console.error("[live session] closed", info);
          clearResponseWatchdog();
          setIsInterviewerSpeaking(false);
          setIsCandidateSpeaking(false);
          // stop() is already mid-flush/score for this close — don't let a
          // late, unrelated status update stomp over "scoring" or whatever
          // stop() lands on when it finishes.
          if (endingRef.current) return;
          if (!info.wasClean || info.code !== 1000) {
            setErrorMessage(
              `session closed: code ${info.code}${info.reason ? ` — ${info.reason}` : ""}`,
            );
            setStatus("error");
          } else {
            setStatus("idle");
          }
        },
      });

      sessionRef.current = session;

      recorderRef.current = await startRecording(micStream, {
        onChunk: (chunk) => sendAudioChunk(session, chunk),
        onLocalActivityStart: () => {
          setIsCandidateSpeaking(true);
          cancelPendingActivityEnd();
        },
        onLocalActivityEnd: () => {
          setIsCandidateSpeaking(false);
          markActivityEnd();
          startResponseWatchdog();
          flushAccumulatedTurn("candidate", candidateAccRef);
        },
        onError: (error) => console.error("[recorder]", error),
      });
    } catch (error) {
      console.error("[session start]", error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatus("error");
      void stop();
    }
  }, [
    cancelPendingActivityEnd,
    captureTranscriptChunk,
    clearResponseWatchdog,
    drillInfo.isDrill,
    drillInfo.questionIndex,
    flushAccumulatedTurn,
    flushTurns,
    isRealSession,
    markActivityEnd,
    stageId,
    startResponseWatchdog,
    stop,
  ]);

  const median = percentile(ttfaSamples, 0.5);

  return (
    <main className="flex flex-1 flex-col h-[calc(100vh-57px)] w-full overflow-hidden">
      <InterviewRoom
        sessionId={sessionId}
        isRealSession={isRealSession}
        status={status}
        onStart={() => void start()}
        onStop={() => void stop()}
        transcript={transcript}
        isInterviewerSpeaking={isInterviewerSpeaking}
        isCandidateSpeaking={isCandidateSpeaking}
        interviewerName={stageInfo?.persona?.name ?? "AI Interviewer"}
        interviewerRole={stageInfo?.persona?.role ?? "Technical Evaluator"}
        interviewerTone={stageInfo?.persona?.tone ?? "neutral"}
        strictness={stageInfo?.persona?.strictness ?? 3}
        stageTitle={stageInfo?.title ?? (isRealSession ? "Interview Session" : "Voice Loop Smoke Test")}
        targetRole={stageInfo?.targetRole}
        company={stageInfo?.company}
        lastTtfa={lastTtfa}
        medianTtfa={median}
        errorMessage={errorMessage}
        stalledWarning={stalledWarning}
        scoringRecoverable={scoringRecoverable}
        isDrill={drillInfo.isDrill}
        drillQuestion={drillInfo.targetQuestion}
        drillTargets={drillInfo.targets}
      />
    </main>
  );
}

function percentile(samples: number[], p: number): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index];
}

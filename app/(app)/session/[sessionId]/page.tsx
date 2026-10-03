"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@google/genai";

import { startRecording, type AudioRecorderHandle } from "@/lib/audio/recorder";
import { describeMicError, requestMicrophone } from "@/lib/audio/mic";
import { createAudioPlayer, type AudioPlayerHandle } from "@/lib/audio/player";
import { connectLiveSession, sendAudioChunk, startInterviewerTurn } from "@/lib/live/client";
import type { TokenResponseBody } from "@/lib/live/types";
import { TurnTimeline } from "@/lib/live/turn-timeline";
import { describeLimitRefusal } from "@/lib/limit-messages";
import { classifyLiveClose, describeLiveClose } from "@/lib/live/close-reason";
import { createClient } from "@/lib/supabase/client";
import { InterviewRoom } from "@/components/interview/InterviewRoom";
import { describeScoringFailure } from "@/components/interview/ScoreSessionButton";
import { reportEvent } from "@/lib/monitoring/events";

// Phase 0 §4 walking-skeleton harness, extended in Phase 3 (§7.1) into the
// real interview room when a stageId is present: mode: 'full', turn capture,
// and end-of-session scoring. Without a stageId this stays the original
// unguarded connectivity smoke test — no CV data, no stage-specific prompt.

type Status = "idle" | "connecting" | "connected" | "scoring" | "error";

interface TranscriptLine {
  role: "candidate" | "interviewer";
  text: string;
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
  const { sessionId: routeSessionId } = use(params);
  // `/session/new?stageId=…` has no row yet: it's created when the call
  // starts. Opening the room and leaving used to leave an "active" session
  // behind forever (production readiness phase 6). The id lives in a ref too,
  // so callbacks set up during the call (flushes, scoring) see it.
  const [sessionId, setSessionId] = useState<string | null>(routeSessionId === "new" ? null : routeSessionId);
  const sessionIdRef = useRef<string | null>(sessionId);
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

      // A new room has no row yet; the drill details come from the URL.
      const sessionRow =
        routeSessionId === "new"
          ? null
          : (
              await supabase
                .from("sessions")
                .select("usage")
                .eq("id", routeSessionId)
                .maybeSingle<{
                  usage: {
                    drill?: boolean;
                    targetQuestion?: string | null;
                    targets?: string | null;
                    questionIndex?: number;
                  } | null;
                }>()
            ).data;

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
  }, [stageId, routeSessionId, isDrillParam, parsedQIndex]);

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

  // Turn capture (specs §7.1) — only meaningful for a real session. Timing
  // comes from audio events, words from transcription; see
  // lib/live/turn-timeline.ts for why those have to be kept apart.
  const sessionStartRef = useRef<number | null>(null);
  const timelineRef = useRef(new TurnTimeline());
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const appendTranscript = useCallback((line: TranscriptLine) => {
    setTranscript((prev) => [...prev, line]);
  }, []);

  // ms since session start, the unit turns.start_ms/end_ms are stored in.
  const sinceStart = useCallback((performanceTime: number = performance.now()) => {
    return performanceTime - (sessionStartRef.current ?? performanceTime);
  }, []);

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
      reportEvent("live.watchdog_silence", { mode: "full" });
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

  const flushTurns = useCallback(
    async (status?: "completed" | "abandoned" | "errored", keepalive = false) => {
      const id = sessionIdRef.current;
      if (!isRealSession || !id) return;
      try {
        const res = await fetch(`/api/sessions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            turns: timelineRef.current.snapshot(sinceStart()),
            ...(status ? { status } : {}),
          }),
          keepalive,
        });
        if (!res.ok) reportEvent("session.flush_failed", { status: res.status });
      } catch (error) {
        console.error("[session] flush failed", error);
        reportEvent("session.flush_failed", { status: "network" });
      }
    },
    [isRealSession, sinceStart],
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
    // Commit whatever's still mid-turn (e.g. the interviewer was talking when
    // the user hit Stop) before it's lost.
    const turns = timelineRef.current.finish(sinceStart());
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

    if (isRealSession && turns.length > 0) {
      setStatus("scoring");
      await flushTurns("completed");
      try {
        const res = await fetch(`/api/sessions/${sessionIdRef.current}/score`, { method: "POST" });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          const refusal = describeLimitRefusal(body);
          throw new Error(
            refusal
              ? `Your interview was saved, but it can't be scored yet. ${refusal}`
              : `Your interview was saved, but scoring didn't finish. ${describeScoringFailure(body?.error, res.status)}`,
          );
        }
        router.push(`/scorecard/${sessionIdRef.current}`);
        return;
      } catch (error) {
        console.error("[session] scoring failed", error);
        // The turns are already flushed and the session is marked completed,
        // so this is recoverable — surface the retry rather than stranding a
        // finished interview behind a console message.
        const message = error instanceof Error ? error.message : "";
        setErrorMessage(
          message.startsWith("Your interview was saved")
            ? message
            : "Your interview was saved, but scoring failed — usually the model being briefly overloaded.",
        );
        setScoringRecoverable(true);
        setStatus("error");
        return;
      }
    }

    setStatus("idle");
  }, [isRealSession, flushTurns, sinceStart, clearResponseWatchdog, router]);

  const start = useCallback(async () => {
    setErrorMessage(null);
    setScoringRecoverable(false);
    clearResponseWatchdog();
    setStatus("connecting");
    endingRef.current = false;
    sessionStartRef.current = performance.now();
    setTranscript([]);
    timelineRef.current = new TurnTimeline((turn) =>
      appendTranscript({ role: turn.role, text: turn.transcript }),
    );

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
      reportEvent("live.mic_error", { name: error instanceof DOMException ? error.name : "unknown" });
      setErrorMessage(describeMicError(error));
      setStatus("error");
      return;
    }

    // A real interview gets its row now, after the mic is granted — not
    // when the room opened. Deleted again below if the call never starts.
    let createdNow: string | null = null;
    if (isRealSession && !sessionIdRef.current) {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          drillInfo.isDrill
            ? { stageId, drill: true, questionIndex: drillInfo.questionIndex ?? 0 }
            : { stageId },
        ),
      });
      const body = (await res.json().catch(() => null)) as { sessionId?: string; error?: string } | null;
      if (!res.ok || !body?.sessionId) {
        micStream.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
        setErrorMessage(describeTokenRefusal(body) ?? `Couldn't start the interview (error ${res.status}).`);
        setStatus("error");
        return;
      }
      createdNow = body.sessionId;
      sessionIdRef.current = createdNow;
      setSessionId(createdNow);
      // Same page, real id: a refresh from here reopens this session. No
      // navigation, so nothing remounts mid-call.
      window.history.replaceState(null, "", `/session/${createdNow}${window.location.search}`);
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
        const refusal = await tokenRes.json().catch(() => null);
        reportEvent("live.token_refused", {
          status: tokenRes.status,
          error: (refusal as { error?: string } | null)?.error,
        });
        throw new Error(describeTokenRefusal(refusal) ?? `token endpoint returned ${tokenRes.status}`);
      }

      const tokenBody: TokenResponseBody = await tokenRes.json();
      const player = createAudioPlayer();
      playerRef.current = player;

      // The socket died under us (quota, network, a server error). Release
      // the mic and speakers, and keep what was said: the turns are saved
      // as "errored" so the interview can still be scored from Interviews
      // instead of losing everything since the last 60s flush.
      const abandonAfterDrop = async (reason: string) => {
        endingRef.current = true;
        if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
        const turns = timelineRef.current.finish(sinceStart());
        recorderRef.current?.stop();
        recorderRef.current = null;
        micStreamRef.current?.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
        playerRef.current?.close();
        playerRef.current = null;
        sessionRef.current = null;
        const saved = isRealSession && turns.length > 0;
        if (saved) await flushTurns("errored");
        setErrorMessage(saved ? `${reason} Your answers so far are saved — you can score them from Interviews.` : reason);
        setStatus("error");
      };

      // connect() resolves when the socket opens, but input sent before the
      // server's setupComplete is rejected — the opening cue waits for both.
      let markSetupComplete!: () => void;
      const setupComplete = new Promise<void>((resolve) => (markSetupComplete = resolve));

      const session = await connectLiveSession(tokenBody, {
        onOpen: () => console.log("[live session] websocket open"),

        onSetupComplete: () => {
          markSetupComplete();
          setStatus("connected");
          if (isRealSession) {
            flushIntervalRef.current = setInterval(() => void flushTurns(), FLUSH_INTERVAL_MS);
          }
        },

        onAudioChunk: (chunk) => {
          timelineRef.current.interviewerAudio(sinceStart(player.enqueue(chunk)));
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
        },

        onTurnComplete: () => {
          setIsInterviewerSpeaking(false);
          timelineRef.current.interviewerTurnEnd(sinceStart(player.playbackEndsAt()));
        },

        onInterrupted: () => {
          player.interrupt();
          setIsInterviewerSpeaking(false);
          timelineRef.current.interviewerInterrupted(sinceStart());
        },

        onInputTranscript: (text) => {
          timelineRef.current.candidateText(sinceStart(), text);
        },

        onOutputTranscript: (text) => {
          timelineRef.current.interviewerText(sinceStart(), text);
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
            const kind = classifyLiveClose(info.code, info.reason);
            reportEvent("live.closed_abnormally", { mode: "full", code: info.code, kind });
            void abandonAfterDrop(describeLiveClose(info.code, info.reason) ?? "The connection closed.");
          } else {
            setStatus("idle");
          }
        },
      });

      sessionRef.current = session;
      void setupComplete.then(() => startInterviewerTurn(session));

      recorderRef.current = await startRecording(micStream, {
        onChunk: (chunk) => sendAudioChunk(session, chunk),
        onLocalActivityStart: () => {
          setIsCandidateSpeaking(true);
          cancelPendingActivityEnd();
          timelineRef.current.candidateSpeechStart(sinceStart());
        },
        onLocalActivityEnd: () => {
          setIsCandidateSpeaking(false);
          markActivityEnd();
          startResponseWatchdog();
          timelineRef.current.candidateSpeechEnd(sinceStart());
        },
        onError: (error) => console.error("[recorder]", error),
      });
    } catch (error) {
      console.error("[session start]", error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatus("error");
      // The call never started, so the row created for it would only be an
      // empty "not started" entry in the history: remove it.
      if (createdNow) {
        void fetch(`/api/sessions/${createdNow}`, { method: "DELETE" });
        sessionIdRef.current = null;
        setSessionId(null);
        window.history.replaceState(null, "", `/session/new${window.location.search}`);
      }
      void stop();
    }
  }, [
    appendTranscript,
    cancelPendingActivityEnd,
    clearResponseWatchdog,
    drillInfo.isDrill,
    drillInfo.questionIndex,
    flushTurns,
    isRealSession,
    markActivityEnd,
    sinceStart,
    stageId,
    startResponseWatchdog,
    stop,
  ]);

  const median = percentile(ttfaSamples, 0.5);
  const getInterviewerLevel = useCallback(() => playerRef.current?.getLevel() ?? 0, []);

  return (
    <main className="flex flex-1 flex-col h-[calc(100vh-57px)] w-full overflow-hidden">
      <InterviewRoom
        sessionId={sessionId ?? "new"}
        isRealSession={isRealSession}
        status={status}
        onStart={() => void start()}
        onStop={() => void stop()}
        transcript={transcript}
        isInterviewerSpeaking={isInterviewerSpeaking}
        isCandidateSpeaking={isCandidateSpeaking}
        getInterviewerLevel={getInterviewerLevel}
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

// Why the server refused a Live token, in words. The microphone was granted
// but nothing was spent, so each says what to do next.
function describeTokenRefusal(body: unknown): string | null {
  const limit = describeLimitRefusal(body);
  if (limit) return limit;
  const error = body && typeof body === "object" ? (body as { error?: string }).error : undefined;
  switch (error) {
    case "unauthorized":
      return "Your session has expired. Sign in again to start the interview.";
    case "stage_locked":
      return "This stage is still locked. Pass the previous stage first.";
    case "smoke_test_disabled":
      return "The voice connectivity test is turned off on this server. Start an interview from a roadmap instead.";
    case "token_mint_failed":
      return "The voice service didn't respond. Nothing was used — try again in a minute.";
    default:
      return null;
  }
}

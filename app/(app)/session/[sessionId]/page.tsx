"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@google/genai";

import { startRecording, type AudioRecorderHandle } from "@/lib/audio/recorder";
import { createAudioPlayer, type AudioPlayerHandle } from "@/lib/audio/player";
import { connectLiveSession, sendAudioChunk } from "@/lib/live/client";
import type { TokenResponseBody } from "@/lib/live/types";
import type { Turn } from "@/lib/metrics/deterministic";

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
  const stageId = useSearchParams().get("stageId");
  const isRealSession = Boolean(stageId);
  const router = useRouter();

  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stalledWarning, setStalledWarning] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [ttfaSamples, setTtfaSamples] = useState<number[]>([]);
  const [lastTtfa, setLastTtfa] = useState<number | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const recorderRef = useRef<AudioRecorderHandle | null>(null);
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
    // Flush whatever's still mid-turn (e.g. the interviewer was talking when
    // the user hit Stop) before it's lost.
    flushAccumulatedTurn("candidate", candidateAccRef);
    flushAccumulatedTurn("interviewer", interviewerAccRef);
    recorderRef.current?.stop();
    recorderRef.current = null;
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
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setStatus("error");
        return;
      }
    }

    setStatus("idle");
  }, [isRealSession, sessionId, flushTurns, flushAccumulatedTurn, clearResponseWatchdog, router]);

  const start = useCallback(async () => {
    setErrorMessage(null);
    clearResponseWatchdog();
    setStatus("connecting");
    endingRef.current = false;
    sessionStartRef.current = performance.now();
    turnsRef.current = [];
    candidateAccRef.current = { text: "", startMs: null };
    interviewerAccRef.current = { text: "", startMs: null };

    try {
      const tokenRes = await fetch("/api/live/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isRealSession ? { mode: "full", stageId } : { mode: "full" }),
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

        onTurnComplete: () => flushAccumulatedTurn("interviewer", interviewerAccRef),

        onInterrupted: () => {
          player.interrupt();
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
          setErrorMessage(String(error));
          setStatus("error");
        },

        onClose: (info) => {
          console.error("[live session] closed", info);
          clearResponseWatchdog();
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

      recorderRef.current = await startRecording({
        onChunk: (chunk) => sendAudioChunk(session, chunk),
        onLocalActivityStart: cancelPendingActivityEnd,
        onLocalActivityEnd: () => {
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
    flushAccumulatedTurn,
    flushTurns,
    isRealSession,
    markActivityEnd,
    stageId,
    startResponseWatchdog,
    stop,
  ]);

  const median = percentile(ttfaSamples, 0.5);
  const p90 = percentile(ttfaSamples, 0.9);

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <div className="fixed top-4 right-4 rounded border border-zinc-300 bg-white/90 p-3 text-sm text-zinc-900 shadow">
        <div>TTFA: {lastTtfa !== null ? `${Math.round(lastTtfa)} ms` : "—"}</div>
        <div>median: {median !== null ? `${Math.round(median)} ms` : "—"}</div>
        <div>p90: {p90 !== null ? `${Math.round(p90)} ms` : "—"}</div>
      </div>

      <h1 className="text-lg font-medium">Session {sessionId} — voice loop</h1>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={start}
          disabled={status === "connecting" || status === "connected" || status === "scoring"}
          className="rounded border border-zinc-400 px-4 py-2"
        >
          Start
        </button>
        <button
          type="button"
          onClick={() => void stop()}
          disabled={status === "idle" || status === "connecting" || status === "scoring"}
          className="rounded border border-zinc-400 px-4 py-2"
        >
          Stop
        </button>
        <span className="self-center text-sm text-zinc-500">status: {status}</span>
      </div>

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      {stalledWarning && <p className="text-sm text-amber-600">{stalledWarning}</p>}

      <ul className="flex flex-col gap-1 text-sm">
        {transcript.map((line, index) => (
          <li key={index}>
            <strong>{line.role}:</strong> {line.text}
          </li>
        ))}
      </ul>
    </main>
  );
}

function percentile(samples: number[], p: number): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index];
}

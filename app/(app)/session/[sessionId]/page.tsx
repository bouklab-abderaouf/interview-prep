"use client";

import { use, useCallback, useRef, useState } from "react";
import type { Session } from "@google/genai";

import { startRecording, type AudioRecorderHandle } from "@/lib/audio/recorder";
import { createAudioPlayer, type AudioPlayerHandle } from "@/lib/audio/player";
import { connectLiveSession, sendAudioChunk } from "@/lib/live/client";
import type { TokenResponseBody } from "@/lib/live/types";

// Phase 0 §4 — the walking-skeleton voice loop. No auth, no database, no
// styling: this page exists to prove the loop works and to read a TTFA
// number off the screen (specs §4.5 acceptance criteria).

type Status = "idle" | "connecting" | "connected" | "error";

interface TranscriptLine {
  role: "candidate" | "interviewer";
  text: string;
}

export default function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);

  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [ttfaSamples, setTtfaSamples] = useState<number[]>([]);
  const [lastTtfa, setLastTtfa] = useState<number | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const recorderRef = useRef<AudioRecorderHandle | null>(null);
  const playerRef = useRef<AudioPlayerHandle | null>(null);
  const activityEndAtRef = useRef<number | null>(null);
  const awaitingFirstAudioRef = useRef(false);

  const appendTranscript = useCallback((line: TranscriptLine) => {
    setTranscript((prev) => [...prev, line]);
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

  // If speech resumes before any reply audio arrived, the pending anchor was
  // a false positive (a mid-sentence pause past SILENCE_HANGOVER_MS, not a
  // real end of turn) — drop it so a stale timestamp doesn't inflate the next
  // real TTFA sample. No-op if a reply already arrived, since onAudioChunk
  // clears awaitingFirstAudioRef the moment audio actually shows up.
  const cancelPendingActivityEnd = useCallback(() => {
    awaitingFirstAudioRef.current = false;
    activityEndAtRef.current = null;
  }, []);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    playerRef.current?.close();
    playerRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    setErrorMessage(null);
    setStatus("connecting");

    try {
      const tokenRes = await fetch("/api/live/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "demo" }),
      });

      if (!tokenRes.ok) {
        throw new Error(`token endpoint returned ${tokenRes.status}`);
      }

      const tokenBody: TokenResponseBody = await tokenRes.json();
      const player = createAudioPlayer();
      playerRef.current = player;

      const session = await connectLiveSession(tokenBody, {
        onOpen: () => console.log("[live session] websocket open"),

        onSetupComplete: () => setStatus("connected"),

        onAudioChunk: (chunk) => {
          player.enqueue(chunk);
          if (awaitingFirstAudioRef.current && activityEndAtRef.current !== null) {
            const ttfa = performance.now() - activityEndAtRef.current;
            awaitingFirstAudioRef.current = false;
            activityEndAtRef.current = null;
            setLastTtfa(ttfa);
            setTtfaSamples((prev) => [...prev, ttfa]);
          }
        },

        onActivityEnd: markActivityEnd,

        onInterrupted: () => {
          player.interrupt();
        },

        onInputTranscript: (text, finished) => {
          console.log("[candidate]", text, finished ? "(final)" : "");
          if (finished) appendTranscript({ role: "candidate", text });
        },

        onOutputTranscript: (text, finished) => {
          console.log("[interviewer]", text, finished ? "(final)" : "");
          if (finished) appendTranscript({ role: "interviewer", text });
        },

        onError: (error) => {
          console.error("[live session] error", error);
          setErrorMessage(String(error));
          setStatus("error");
        },

        onClose: (info) => {
          console.error("[live session] closed", info);
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
        onLocalActivityEnd: markActivityEnd,
        onError: (error) => console.error("[recorder]", error),
      });
    } catch (error) {
      console.error("[session start]", error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStatus("error");
      stop();
    }
  }, [appendTranscript, cancelPendingActivityEnd, markActivityEnd, stop]);

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
          disabled={status === "connecting" || status === "connected"}
          className="rounded border border-zinc-400 px-4 py-2"
        >
          Start
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={status === "idle" || status === "connecting"}
          className="rounded border border-zinc-400 px-4 py-2"
        >
          Stop
        </button>
        <span className="self-center text-sm text-zinc-500">status: {status}</span>
      </div>

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

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

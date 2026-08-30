"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@google/genai";

import { startRecording, type AudioRecorderHandle } from "@/lib/audio/recorder";
import { createAudioPlayer, type AudioPlayerHandle } from "@/lib/audio/player";
import { connectLiveSession, sendAudioChunk } from "@/lib/live/client";
import type { TokenResponseBody, InterviewLanguage } from "@/lib/live/types";
import { MicPermissionGate } from "@/components/interview/MicPermissionGate";

// Phase 1 §5.2 — no-auth 2-minute demo: fixture CV/JD, Turnstile, countdown.

// Mirrors DEMO_SESSION_MAX_SECONDS (specs §2). That var is server-only (not
// NEXT_PUBLIC_), so it's duplicated here for display; the real cap is
// enforced server-side via the ephemeral token's expireTime.
const DEMO_SESSION_MAX_SECONDS = 120;

type Stage = "setup" | "mic-gate" | "live" | "ended" | "error";

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

// Module-level singleton: React Strict Mode double-invokes effects in dev,
// and Cloudflare's own script warns loudly ("Turnstile already has been
// loaded") if it's injected twice. A promise cached outside the component
// survives repeated mount/cleanup/remount cycles.
let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window !== "undefined" && window.turnstile) return Promise.resolve();
  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Turnstile script failed to load"));
      document.body.appendChild(script);
    });
  }
  return turnstileScriptPromise;
}

function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(
    () => typeof window !== "undefined" && !!window.turnstile,
  );
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (!cancelled) setScriptLoaded(true);
      })
      .catch((error) => console.error("[turnstile]", error));
    return () => {
      cancelled = true;
    };
  }, [siteKey]);

  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !siteKey || !window.turnstile) return;

    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onToken,
      "expired-callback": () => onToken(null),
    });
    widgetIdRef.current = widgetId;

    return () => {
      window.turnstile?.remove(widgetId);
      widgetIdRef.current = null;
    };
  }, [scriptLoaded, siteKey, onToken]);

  if (!siteKey) {
    return (
      <p className="text-sm text-red-600">
        Bot protection isn&apos;t configured yet (NEXT_PUBLIC_TURNSTILE_SITE_KEY) — the demo can&apos;t start.
      </p>
    );
  }

  return <div ref={containerRef} />;
}

export default function DemoPage() {
  const [language, setLanguage] = useState<InterviewLanguage>("fr");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("setup");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(DEMO_SESSION_MAX_SECONDS);

  const sessionRef = useRef<Session | null>(null);
  const recorderRef = useRef<AudioRecorderHandle | null>(null);
  const playerRef = useRef<AudioPlayerHandle | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const endDemo = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    playerRef.current?.close();
    playerRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
    setStage((prev) => (prev === "error" ? prev : "ended"));
  }, []);

  const beginLiveSession = useCallback(async () => {
    if (!turnstileToken) return;
    setErrorMessage(null);

    try {
      const tokenRes = await fetch("/api/live/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "demo", turnstileToken, language }),
      });

      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}) as { reason?: string });
        throw new Error(body.reason ?? `token endpoint returned ${tokenRes.status}`);
      }

      const tokenBody: TokenResponseBody = await tokenRes.json();
      const player = createAudioPlayer();
      playerRef.current = player;

      const session = await connectLiveSession(tokenBody, {
        onSetupComplete: () => setStage("live"),
        onAudioChunk: (chunk) => player.enqueue(chunk),
        onInterrupted: () => player.interrupt(),
        onClose: () => endDemo(),
        onError: (error) => {
          console.error("[demo] live session error", error);
          setErrorMessage(String(error));
          setStage("error");
        },
      });
      sessionRef.current = session;

      recorderRef.current = await startRecording({
        onChunk: (chunk) => sendAudioChunk(session, chunk),
        onError: (error) => console.error("[demo] recorder error", error),
      });

      setSecondsLeft(DEMO_SESSION_MAX_SECONDS);
      countdownRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            endDemo();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error) {
      console.error("[demo] failed to start", error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStage("error");
    }
  }, [turnstileToken, language, endDemo]);

  // Unmount safety net — e.g. navigating away mid-demo.
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      recorderRef.current?.stop();
      playerRef.current?.close();
      sessionRef.current?.close();
    };
  }, []);

  if (stage === "ended") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-16 text-center">
        <h1 className="text-xl font-medium">That&apos;s the demo.</h1>
        <p className="max-w-md text-zinc-500">
          A real session builds a full scorecard from your transcript — STAR
          breakdown, pacing, filler words, model answers. Sign up to get
          yours from your own CV.
        </p>
        <a href="/onboarding" className="rounded border border-zinc-400 px-4 py-2">
          Sign up to get the real one
        </a>
        <a href="/sample-scorecard" className="text-sm underline">
          See a sample scorecard
        </a>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-16">
      <h1 className="text-xl font-medium">2-minute demo</h1>

      {stage === "setup" && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLanguage("fr")}
              className={`rounded border px-3 py-1 ${language === "fr" ? "border-blue-500" : "border-zinc-400"}`}
            >
              FR
            </button>
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`rounded border px-3 py-1 ${language === "en" ? "border-blue-500" : "border-zinc-400"}`}
            >
              EN
            </button>
          </div>

          <TurnstileWidget onToken={setTurnstileToken} />

          <button
            type="button"
            onClick={() => setStage("mic-gate")}
            disabled={!turnstileToken}
            className="rounded border border-zinc-400 px-4 py-2 disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      )}

      {stage === "mic-gate" && <MicPermissionGate onGranted={beginLiveSession} />}

      {stage === "live" && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-3xl tabular-nums">{secondsLeft}s</p>
          <button type="button" onClick={endDemo} className="rounded border border-zinc-400 px-4 py-2">
            End demo
          </button>
        </div>
      )}

      {stage === "error" && errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
    </main>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Session } from "@google/genai";

import { startRecording, type AudioRecorderHandle } from "@/lib/audio/recorder";
import { createAudioPlayer, type AudioPlayerHandle } from "@/lib/audio/player";
import { connectLiveSession, sendAudioChunk, startInterviewerTurn } from "@/lib/live/client";
import { TurnTimeline } from "@/lib/live/turn-timeline";
import type { TokenResponseBody, InterviewLanguage } from "@/lib/live/types";
import { demoScenario } from "@/lib/fixtures/demo-scenario";
import { computeDeterministicMetrics, type Turn } from "@/lib/metrics/deterministic";
import {
  assessFillers,
  assessPace,
  assessPause,
  assessTalkRatio,
  type Assessment,
} from "@/lib/metrics/assessment";
import { MicPermissionGate } from "@/components/interview/MicPermissionGate";
import { Avatar3D } from "@/components/interview/Avatar3D";
import { AudioVisualizer } from "@/components/interview/AudioVisualizer";
import { TranscriptFeed, type TranscriptEntry } from "@/components/interview/TranscriptFeed";
import { StatusBadge } from "@/components/scorecard/StatusBadge";

// Phase 1 §5.2 — no-auth 2-minute demo: fixture CV/JD, Turnstile, countdown.
//
// What a voice-AI demo has to get right, and this one originally didn't: the
// AI speaks first (it used to wait silently for the visitor), it's always
// visible whose turn it is and that the mic is live, captions run alongside,
// the visitor knows who they're playing (the fixture CV was never shown), and
// it ends with something to take away before asking for a sign-up. The
// take-away here is the deterministic delivery metrics — free to compute, no
// Gemini scoring call on a public, anonymous endpoint.

// Mirrors DEMO_SESSION_MAX_SECONDS (specs §2). That var is server-only (not
// NEXT_PUBLIC_), so it's duplicated here for display; the real cap is
// enforced server-side via the ephemeral token's expireTime.
const DEMO_SESSION_MAX_SECONDS = 120;

type Stage = "setup" | "mic-gate" | "connecting" | "live" | "ended" | "error";

// How long the interviewer has to open the call before the visitor is told
// they can start it themselves.
const OPENING_GRACE_MS = 8000;
// Same idea as the interview room's watchdog: silence after an answer is
// usually the Live API's free-tier quota, and should say so.
const REPLY_WATCHDOG_MS = 12_000;

// The fixture CV, condensed for the role card. Kept beside the scenario's
// prompt text in spirit: if lib/fixtures/demo-scenario.ts changes, so should this.
const CANDIDATE_FACTS = [
  "Frontend engineer, 4 years",
  "React + TypeScript; rebuilt a checkout, −12% cart abandonment",
  "6 months at a startup that shut down",
  "An unexplained 8-month gap on the CV",
  "Docker for local dev — no Kubernetes",
];
const ROLE_FACTS = [
  "Senior Frontend Engineer, Northwind Labs",
  "5+ years expected",
  "Owns a Kubernetes deployment pipeline",
  "GraphQL, and leading 2–3 engineers",
];

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

  const [captions, setCaptions] = useState<TranscriptEntry[]>([]);
  const [liveCandidateText, setLiveCandidateText] = useState("");
  const [liveInterviewerText, setLiveInterviewerText] = useState("");
  const [interviewerSpeaking, setInterviewerSpeaking] = useState(false);
  const [candidateSpeaking, setCandidateSpeaking] = useState(false);
  const [interviewerHasSpoken, setInterviewerHasSpoken] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [finalTurns, setFinalTurns] = useState<Turn[]>([]);

  const sessionRef = useRef<Session | null>(null);
  const recorderRef = useRef<AudioRecorderHandle | null>(null);
  // The gate grants the mic before the token is minted, so the tracks need an
  // owner during the window where the recorder doesn't exist yet.
  const micStreamRef = useRef<MediaStream | null>(null);
  const playerRef = useRef<AudioPlayerHandle | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionStartRef = useRef(0);
  const timelineRef = useRef(new TurnTimeline());
  const endedRef = useRef(false);

  const sinceStart = (performanceTime: number = performance.now()) => performanceTime - sessionStartRef.current;

  const clearHintTimer = () => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = null;
  };

  const endDemo = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    clearHintTimer();
    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
    recorderRef.current?.stop();
    recorderRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    playerRef.current?.close();
    playerRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
    setFinalTurns(timelineRef.current.finish(performance.now() - sessionStartRef.current));
    setInterviewerSpeaking(false);
    setCandidateSpeaking(false);
    setStage((prev) => (prev === "error" ? prev : "ended"));
  }, []);

  const beginLiveSession = useCallback(
    async (micStream: MediaStream) => {
      if (!turnstileToken) return;
      setErrorMessage(null);
      setStage("connecting");
      micStreamRef.current = micStream;
      endedRef.current = false;
      timelineRef.current = new TurnTimeline((turn) => {
        setCaptions((prev) => [...prev, { role: turn.role, text: turn.transcript }]);
        if (turn.role === "candidate") setLiveCandidateText("");
        else setLiveInterviewerText("");
      });

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

        let markSetupComplete!: () => void;
        const setupComplete = new Promise<void>((resolve) => (markSetupComplete = resolve));

        const session = await connectLiveSession(tokenBody, {
          onSetupComplete: () => {
            markSetupComplete();
            sessionStartRef.current = performance.now();
            setStage("live");
            hintTimerRef.current = setTimeout(
              () => setHint("Not hearing Camille? Say \"Bonjour\" to start the conversation yourself."),
              OPENING_GRACE_MS,
            );
            countdownRef.current = setInterval(() => {
              setSecondsLeft((prev) => {
                if (prev <= 1) {
                  endDemo();
                  return 0;
                }
                return prev - 1;
              });
            }, 1000);
          },
          onAudioChunk: (chunk) => {
            timelineRef.current.interviewerAudio(sinceStart(player.enqueue(chunk)));
            clearHintTimer();
            setHint(null);
            setInterviewerHasSpoken(true);
            setInterviewerSpeaking(true);
            if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
            speakingTimeoutRef.current = setTimeout(() => setInterviewerSpeaking(false), 450);
          },
          onTurnComplete: () => {
            timelineRef.current.interviewerTurnEnd(sinceStart(player.playbackEndsAt()));
          },
          onInterrupted: () => {
            player.interrupt();
            setInterviewerSpeaking(false);
            timelineRef.current.interviewerInterrupted(sinceStart());
          },
          onInputTranscript: (text) => {
            timelineRef.current.candidateText(sinceStart(), text);
            setLiveCandidateText((prev) => prev + text);
          },
          onOutputTranscript: (text) => {
            timelineRef.current.interviewerText(sinceStart(), text);
            setLiveInterviewerText((prev) => prev + text);
          },
          onClose: (info) => {
            if (endedRef.current) return;
            if (info.code === 1011) {
              setErrorMessage("The demo's voice service hit its usage limit. Try again later, or see a sample scorecard.");
              setStage("error");
            }
            endDemo();
          },
          onError: (error) => {
            console.error("[demo] live session error", error);
            setErrorMessage("The connection to the voice service dropped. Try again in a moment.");
            setStage("error");
            endDemo();
          },
        });
        sessionRef.current = session;
        void setupComplete.then(() => startInterviewerTurn(session));

        recorderRef.current = await startRecording(micStream, {
          onChunk: (chunk: string) => sendAudioChunk(session, chunk),
          onLocalActivityStart: () => {
            setCandidateSpeaking(true);
            clearHintTimer();
            setHint(null);
            timelineRef.current.candidateSpeechStart(sinceStart());
          },
          onLocalActivityEnd: () => {
            setCandidateSpeaking(false);
            timelineRef.current.candidateSpeechEnd(sinceStart());
            clearHintTimer();
            hintTimerRef.current = setTimeout(
              () => setHint("No reply yet — the voice service may be busy. Keep going, or end the demo."),
              REPLY_WATCHDOG_MS,
            );
          },
          onError: (error: unknown) => console.error("[demo] recorder error", error),
        });
      } catch (error) {
        console.error("[demo] failed to start", error);
        setErrorMessage(describeStartError(error));
        setStage("error");
        endDemo();
      }
    },
    [turnstileToken, language, endDemo],
  );

  // Unmount safety net — e.g. navigating away mid-demo.
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      recorderRef.current?.stop();
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      playerRef.current?.close();
      sessionRef.current?.close();
    };
  }, []);

  const getInterviewerLevel = useCallback(() => playerRef.current?.getLevel() ?? 0, []);

  if (stage === "ended") return <DemoSnapshot turns={finalTurns} language={language} />;

  const shownCaptions: TranscriptEntry[] = [
    ...captions,
    ...(liveCandidateText.trim() ? [{ role: "candidate" as const, text: liveCandidateText.trim() }] : []),
    ...(liveInterviewerText.trim() ? [{ role: "interviewer" as const, text: liveInterviewerText.trim() }] : []),
  ];

  const turnLabel = !interviewerHasSpoken
    ? "Camille is joining…"
    : interviewerSpeaking
      ? "Camille is speaking"
      : candidateSpeaking
        ? "Listening…"
        : "Your turn — answer out loud";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">2-minute live demo</h1>

      {stage === "setup" && (
        <section className="flex flex-col gap-6">
          <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
            A real spoken interview with an AI recruiter. For the demo you play a candidate whose
            CV the interviewer has already read — and it will probe the weak spots, the way a real
            screen would.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <FactCard title={`You play: ${demoScenario.candidateName}`} facts={CANDIDATE_FACTS} />
            <FactCard title="Interviewing for" facts={ROLE_FACTS} />
          </div>

          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Answer as Alex, or as yourself — the interviewer will press on the gaps either way.
            You&apos;ll get a delivery snapshot at the end.
          </p>

          <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Interview language</span>
              <div className="inline-flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700" role="radiogroup">
                {(["fr", "en"] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    role="radio"
                    aria-checked={language === lang}
                    onClick={() => setLanguage(lang)}
                    className={`rounded-md px-3 py-1 text-sm ${
                      language === lang
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                        : "text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    {lang === "fr" ? "Français" : "English"}
                  </button>
                ))}
              </div>
            </div>

            <TurnstileWidget onToken={setTurnstileToken} />

            <button
              type="button"
              onClick={() => setStage("mic-gate")}
              disabled={!turnstileToken}
              className="self-start rounded-lg bg-zinc-900 px-5 py-2.5 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {stage === "mic-gate" && (
        <div className="max-w-xl rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <MicPermissionGate onGranted={beginLiveSession} />
        </div>
      )}

      {(stage === "connecting" || stage === "live") && (
        <section className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-[1fr_320px]">
            <div className="relative h-[340px] overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 sm:h-[400px]">
              <Avatar3D
                isSpeaking={interviewerSpeaking}
                tone="warm"
                getLevel={getInterviewerLevel}
                seed={demoScenario.interviewerName}
              />
              <div className="absolute left-4 top-4 flex flex-col gap-0.5 rounded-xl bg-black/60 px-3 py-1.5 text-zinc-100 backdrop-blur-md">
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  {demoScenario.interviewerName}
                  <span className="rounded bg-blue-500/20 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-blue-300">
                    AI
                  </span>
                </span>
                <span className="text-[10px] text-zinc-400">{demoScenario.interviewerRole}</span>
              </div>
              <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-xl bg-black/60 px-3 py-1.5 text-zinc-100 backdrop-blur-md">
                <AudioVisualizer isActive={interviewerSpeaking} color="blue" />
                <span className="text-xs font-medium" aria-live="polite">
                  {stage === "connecting" ? "Connecting…" : turnLabel}
                </span>
              </div>
            </div>

            <aside className="flex h-[260px] flex-col rounded-2xl border border-zinc-800 bg-zinc-900/90 md:h-[400px]">
              <div className="border-b border-zinc-800 px-4 py-2.5 text-xs font-semibold text-zinc-300">Live captions</div>
              <TranscriptFeed entries={shownCaptions} interviewerName={demoScenario.interviewerName} className="flex-1" />
            </aside>
          </div>

          {hint && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">
              {hint}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <AudioVisualizer isActive={candidateSpeaking} color="emerald" />
              {candidateSpeaking ? "We hear you" : "Your mic is on"}
            </div>
            <span className="font-mono text-lg tabular-nums" aria-label={`${secondsLeft} seconds left`}>
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={endDemo}
              className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
            >
              End demo
            </button>
          </div>
        </section>
      )}

      {stage === "error" && (
        <div className="flex max-w-xl flex-col gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-5">
          <p className="text-sm text-red-700 dark:text-red-300">{errorMessage ?? "Something went wrong."}</p>
          <Link href="/sample-scorecard" className="text-sm underline">
            See a sample scorecard instead
          </Link>
        </div>
      )}
    </main>
  );
}

// Maps the token endpoint's refusal reasons (app/api/live/token) to something
// a visitor can act on, instead of printing the raw code.
const START_ERRORS: Record<string, string> = {
  rate_limited: "You've used the demo a couple of times this hour — it's limited per visitor. Try again later.",
  daily_cap: "The demo has hit today's limit. Come back tomorrow, or see a sample scorecard.",
  demo_paused: "The demo is paused right now. See a sample scorecard instead.",
  turnstile_failed: "The bot check expired. Reload the page and try again.",
};

function describeStartError(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return START_ERRORS[reason] ?? "The demo couldn't start. Try again in a moment.";
}

function FactCard({ title, facts }: { title: string; facts: string[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
        {facts.map((fact) => (
          <li key={fact} className="flex gap-2">
            <span className="text-zinc-400" aria-hidden>
              ·
            </span>
            {fact}
          </li>
        ))}
      </ul>
    </div>
  );
}

// The take-away. Everything here is computed from the turn timings and
// transcript in the browser — no scoring call — and it's honest about what
// the full, CV-based scorecard adds on top.
function DemoSnapshot({ turns, language }: { turns: Turn[]; language: InterviewLanguage }) {
  const answers = turns.filter((t) => t.role === "candidate");
  const metrics = computeDeterministicMetrics(turns, language);
  const rows: { label: string; value: string; assessment: Assessment }[] = [
    { label: "Pace", value: `${Math.round(metrics.pace_wpm)} wpm`, assessment: assessPace(metrics.pace_wpm) },
    { label: "Filler words", value: `${metrics.filler_rate.toFixed(1)} per 100 words`, assessment: assessFillers(metrics.filler_rate) },
    { label: "Talk ratio", value: `${Math.round(metrics.talk_ratio * 100)}% you`, assessment: assessTalkRatio(metrics.talk_ratio) },
    { label: "Longest pause before answering", value: `${(metrics.longest_pause_ms / 1000).toFixed(1)}s`, assessment: assessPause(metrics.longest_pause_ms) },
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Your 2-minute snapshot</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          {answers.length > 0
            ? `${answers.length} answer${answers.length === 1 ? "" : "s"} recorded. Here's how you came across — measured from the conversation, not guessed.`
            : "We didn't catch any answers — the interviewer may not have reached you, or your mic was too quiet."}
        </p>
      </header>

      {answers.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map(({ label, value, assessment }) => (
            <li key={label} className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">{label}</span>
                <StatusBadge status={assessment.status} />
              </div>
              <span className="text-lg font-semibold">{value}</span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{assessment.advice}</span>
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-5">
        <h2 className="font-semibold">With your own CV, you also get</h2>
        <ul className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-300">
          <li>· A score for every question, and a pass mark per stage</li>
          <li>· STAR breakdown — situation, task, action, result</li>
          <li>· Model answers written from your real experience</li>
          <li>· Four interview stages built from the gaps between your CV and the job</li>
        </ul>
        <div className="flex flex-wrap items-center gap-4 pt-1">
          <Link
            href="/onboarding"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Practise with your own CV &rarr;
          </Link>
          <Link href="/sample-scorecard" className="text-sm underline text-zinc-600 dark:text-zinc-400">
            See a full sample scorecard
          </Link>
        </div>
      </section>

      {turns.length > 0 && (
        <details className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <summary className="cursor-pointer text-sm font-medium">Transcript</summary>
          <TranscriptFeed
            entries={turns.map((t) => ({ role: t.role, text: t.transcript }))}
            interviewerName={demoScenario.interviewerName}
            className="mt-2 max-h-96"
          />
        </details>
      )}
    </main>
  );
}

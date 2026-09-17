"use client";

import { useState, useEffect } from "react";

export function InteractiveDemoPreview() {
  const [activeTab, setActiveTab] = useState<"voice" | "scorecard">("voice");
  const [waveStep, setWaveStep] = useState(0);

  // Subtle wave animation effect
  useEffect(() => {
    if (activeTab !== "voice") return;
    const timer = setInterval(() => {
      setWaveStep((prev) => (prev + 1) % 12);
    }, 120);
    return () => clearInterval(timer);
  }, [activeTab]);

  return (
    <div className="w-full overflow-hidden rounded-xl border border-zinc-200 bg-gradient-to-b from-zinc-50 to-zinc-100/60 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
      {/* Top Bar with preview controls */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white/50 px-4 py-2.5 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
          <span className="ml-2 text-xs font-medium text-zinc-500">Live Preview</span>
        </div>

        <div className="flex rounded-lg bg-zinc-200/60 p-0.5 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab("voice")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
              activeTab === "voice"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Voice Interview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("scorecard")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
              activeTab === "scorecard"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Generated Scorecard
          </button>
        </div>
      </div>

      {/* Content View */}
      {activeTab === "voice" ? (
        <div className="flex flex-col gap-6 p-6">
          {/* Persona Header & TTFA badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-semibold text-white shadow-sm">
                M
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">Maëva Iguenane</p>
                <p className="text-xs text-zinc-500">Lead Tech Recruiter · Strictness: 3/5</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-50 px-3 py-1 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live API · 280ms TTFA</span>
            </div>
          </div>

          {/* Animated Waveform Visualizer */}
          <div className="flex h-20 items-center justify-center gap-1.5 rounded-lg border border-zinc-200/80 bg-white/70 px-6 backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/70">
            {[4, 8, 14, 22, 34, 46, 32, 20, 12, 18, 30, 42, 28, 16, 8, 4].map((baseHeight, idx) => {
              const dynamicHeight = Math.max(
                6,
                Math.round(baseHeight * (0.5 + 0.5 * Math.sin((idx + waveStep) * 0.6))),
              );
              return (
                <div
                  key={idx}
                  style={{ height: `${dynamicHeight}px` }}
                  className="w-1.5 rounded-full bg-blue-600 transition-all duration-100 dark:bg-blue-400"
                />
              );
            })}
          </div>

          {/* Spoken Dialog Transcript Sample */}
          <div className="flex flex-col gap-3 text-left">
            <div className="rounded-lg bg-zinc-100/90 p-3.5 text-xs text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">Interviewer: </span>
              &ldquo;Bonjour ! Merci de nous rejoindre. Pour commencer, je vous invite à vous présenter
              et à me retracer votre parcours avec vos propres mots.&rdquo;
            </div>

            <div className="ml-6 rounded-lg bg-blue-50/90 p-3.5 text-xs text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
              <span className="font-semibold text-blue-950 dark:text-blue-100">You: </span>
              &ldquo;Bonjour Maëva ! J&rsquo;ai 5 ans d&rsquo;expérience sur TypeScript, Next.js et
              l&rsquo;intégration de modèles IA génératifs dans des produits web en temps réel...&rdquo;
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5 p-6 text-left">
          {/* Scorecard Hero Stats */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-200/80 bg-white/70 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/70">
            <div>
              <span className="text-xs text-zinc-500 uppercase tracking-wider">Overall Score</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">85</span>
                <span className="text-sm text-zinc-400">/100</span>
                <span className="ml-2 text-amber-500">★★★</span>
              </div>
            </div>
            <div className="text-right">
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                +132 XP Earned
              </span>
              <p className="mt-1 text-xs text-zinc-500">Passed Stage Threshold (60)</p>
            </div>
          </div>

          {/* STAR Framework Breakdown */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Situation", val: 88 },
              { label: "Task", val: 82 },
              { label: "Action", val: 90 },
              { label: "Result", val: 80 },
            ].map((star) => (
              <div
                key={star.label}
                className="rounded-lg border border-zinc-200/60 bg-white/50 p-2.5 text-center dark:border-zinc-800/60 dark:bg-zinc-900/50"
              >
                <div className="text-[11px] text-zinc-500">{star.label}</div>
                <div className="text-base font-semibold">{star.val}</div>
              </div>
            ))}
          </div>

          {/* Speech Telemetry */}
          <div className="flex items-center justify-between rounded-lg bg-zinc-100/80 px-4 py-2.5 text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400">
            <span>Pacing: <strong className="text-zinc-900 dark:text-zinc-100">142 WPM</strong></span>
            <span>Filler words: <strong className="text-zinc-900 dark:text-zinc-100">1.8%</strong></span>
            <span>Talk ratio: <strong className="text-zinc-900 dark:text-zinc-100">64%</strong></span>
          </div>

          {/* Grounded Quote Strengths */}
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-50/40 p-3 text-xs text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">
            <span className="font-semibold">Grounded Strength: </span>
            &ldquo;Excellente structure de réponse et articulation claire des responsabilités techniques.&rdquo;
          </div>
        </div>
      )}
    </div>
  );
}

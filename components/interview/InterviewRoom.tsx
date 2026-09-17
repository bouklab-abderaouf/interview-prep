"use client";

import { useState } from "react";
import Link from "next/link";

import { Avatar3D } from "@/components/interview/Avatar3D";
import { VideoMirror } from "@/components/interview/VideoMirror";
import { SessionTimer } from "@/components/interview/SessionTimer";
import { AudioVisualizer } from "@/components/interview/AudioVisualizer";
import { TranscriptFeed, type TranscriptEntry } from "@/components/interview/TranscriptFeed";
import { ScoreSessionButton } from "@/components/interview/ScoreSessionButton";

interface InterviewRoomProps {
  sessionId: string;
  isRealSession: boolean;
  status: "idle" | "connecting" | "connected" | "scoring" | "error";
  onStart: () => void;
  onStop: () => void;
  transcript: TranscriptEntry[];
  isInterviewerSpeaking: boolean;
  isCandidateSpeaking: boolean;
  interviewerName?: string;
  interviewerRole?: string;
  interviewerTone?: "warm" | "neutral" | "skeptical";
  strictness?: number;
  stageTitle?: string;
  targetRole?: string;
  company?: string | null;
  lastTtfa?: number | null;
  medianTtfa?: number | null;
  errorMessage?: string | null;
  stalledWarning?: string | null;
  scoringRecoverable?: boolean;
}

export function InterviewRoom({
  sessionId,
  isRealSession,
  status,
  onStart,
  onStop,
  transcript,
  isInterviewerSpeaking,
  isCandidateSpeaking,
  interviewerName = "Interviewer",
  interviewerRole = "Lead Evaluator",
  interviewerTone = "neutral",
  strictness = 3,
  stageTitle = "Interview Room",
  targetRole,
  company,
  lastTtfa,
  medianTtfa,
  errorMessage,
  stalledWarning,
  scoringRecoverable,
}: InterviewRoomProps) {
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [showCaptions, setShowCaptions] = useState(true);

  const isLive = status === "connected";
  const isBusy = status === "connecting" || status === "scoring";

  return (
    <div className="flex h-full w-full flex-1 flex-col bg-zinc-950 text-zinc-100">
      {/* ── Top Header Navigation Bar ─────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/60 px-6 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {(status === "idle" || status === "error") && (
            <Link
              href={isRealSession ? "/interviews" : "/home"}
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              &larr; Exit
            </Link>
          )}

          <div className="flex flex-col">
            <h1 className="text-sm font-semibold text-zinc-100">
              {stageTitle}
              {company ? ` · ${company}` : targetRole ? ` · ${targetRole}` : ""}
            </h1>
            <span className="text-[11px] text-zinc-500">Session {sessionId.slice(0, 8)}</span>
          </div>
        </div>

        {/* Center: Timer & Status */}
        <div className="flex items-center gap-3">
          <SessionTimer isActive={isLive} />
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${
              isLive
                ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/50"
                : status === "connecting"
                ? "bg-blue-950/80 text-blue-400 border border-blue-800/50 animate-pulse"
                : status === "scoring"
                ? "bg-amber-950/80 text-amber-400 border border-amber-800/50 animate-pulse"
                : "bg-zinc-800/80 text-zinc-400"
            }`}
          >
            {status}
          </span>
        </div>

        {/* Right: TTFA Telemetry */}
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="hidden sm:inline">TTFA:</span>
          <span className="font-mono text-zinc-200">
            {lastTtfa !== null && lastTtfa !== undefined ? `${Math.round(lastTtfa)}ms` : "—"}
          </span>
          {medianTtfa !== null && medianTtfa !== undefined && (
            <span className="hidden text-[10px] text-zinc-500 md:inline">
              (med {Math.round(medianTtfa)}ms)
            </span>
          )}
        </div>
      </header>

      {/* ── Stalled Warning & Error Banners ──────────────────────── */}
      {stalledWarning && (
        <div className="bg-amber-950/80 border-b border-amber-800/60 px-6 py-2 text-center text-xs text-amber-200">
          ⚠️ {stalledWarning}
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-950/80 border-b border-red-800/60 px-6 py-2 text-center text-xs text-red-200">
          ❌ {errorMessage}
        </div>
      )}

      {/* ── Main Virtual Stage ───────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row overflow-hidden">
        {/* Dual Video Call Grid */}
        <div className="flex flex-1 flex-col sm:flex-row gap-4 h-full min-h-[320px]">
          {/* Interviewer Tile (3D Avatar) */}
          <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-800/90 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-2xl">
            {/* Interviewer Badges */}
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-0.5 rounded-xl bg-black/60 px-3 py-1.5 backdrop-blur-md">
              <span className="text-xs font-semibold text-zinc-100">{interviewerName}</span>
              <span className="text-[10px] text-zinc-400">{interviewerRole}</span>
            </div>

            <div className="absolute top-4 right-4 z-10 flex items-center gap-2 rounded-xl bg-black/60 px-2.5 py-1 text-[11px] text-zinc-300 backdrop-blur-md">
              <span className="capitalize">{interviewerTone}</span>
              <span className="text-zinc-500">·</span>
              <span>Strictness {strictness}/5</span>
            </div>

            {/* 3D WebGL Avatar */}
            <div className="relative flex-1 w-full h-full flex items-center justify-center">
              <Avatar3D isSpeaking={isInterviewerSpeaking} tone={interviewerTone} />
            </div>

            {/* Speaking Audio Indicator Strip */}
            <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-xl bg-black/60 px-3 py-1.5 backdrop-blur-md">
              <AudioVisualizer isActive={isInterviewerSpeaking} color="blue" />
              <span className="text-[11px] text-zinc-300 font-medium">
                {isInterviewerSpeaking ? "Interviewer speaking…" : "Listening"}
              </span>
            </div>
          </div>

          {/* Candidate Mirror Practice Tile */}
          <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-900 shadow-2xl">
            <VideoMirror
              isSpeaking={isCandidateSpeaking}
              candidateName="You (Mirror Practice)"
              cameraEnabled={cameraEnabled}
              onCameraToggle={setCameraEnabled}
            />

            {/* Speaking Audio Indicator Strip */}
            <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-xl bg-black/60 px-3 py-1.5 backdrop-blur-md">
              <AudioVisualizer isActive={isCandidateSpeaking} color="emerald" />
              <span className="text-[11px] text-zinc-300 font-medium">
                {isCandidateSpeaking ? "You speaking…" : "Mic ready"}
              </span>
            </div>
          </div>
        </div>

        {/* Live Captions / Transcript Drawer */}
        {showCaptions && (
          <aside className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/90 shadow-xl lg:w-80 h-48 lg:h-full">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
              <span className="text-xs font-semibold text-zinc-300">Live Captions</span>
              <button
                type="button"
                onClick={() => setShowCaptions(false)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Hide
              </button>
            </div>
            <TranscriptFeed
              entries={transcript}
              interviewerName={interviewerName}
              className="flex-1"
            />
          </aside>
        )}
      </div>

      {/* ── Bottom Call Control Bar (Google Meet Style) ─────────── */}
      <footer className="flex items-center justify-between border-t border-zinc-800/80 bg-zinc-900/90 px-6 py-3 backdrop-blur-md">
        {/* Left: Captions & Camera toggles */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCaptions((prev) => !prev)}
            className={`rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
              showCaptions
                ? "bg-zinc-700 text-zinc-100 hover:bg-zinc-600"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            💬 {showCaptions ? "Captions On" : "Captions Off"}
          </button>
          <button
            type="button"
            onClick={() => setCameraEnabled((prev) => !prev)}
            className={`rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
              cameraEnabled
                ? "bg-zinc-700 text-zinc-100 hover:bg-zinc-600"
                : "bg-red-900/50 text-red-300 hover:bg-red-900"
            }`}
          >
            📷 {cameraEnabled ? "Camera On" : "Camera Off"}
          </button>
        </div>

        {/* Center: Primary Call Action (Start / End Call) */}
        <div className="flex items-center gap-3">
          {status === "idle" || status === "error" ? (
            <button
              type="button"
              onClick={onStart}
              disabled={isBusy}
              className="flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
            >
              <span className="h-2 w-2 rounded-full bg-white animate-ping" />
              Start Interview
            </button>
          ) : (
            <button
              type="button"
              onClick={onStop}
              disabled={status === "scoring"}
              className="flex items-center gap-2 rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-red-500 active:scale-95 disabled:opacity-50"
            >
              <span className="h-2 w-2 rounded-full bg-white" />
              {status === "scoring" ? "Scoring session…" : "Stop & Score"}
            </button>
          )}

          {scoringRecoverable && (
            <ScoreSessionButton sessionId={sessionId} label="Try scoring again" />
          )}
        </div>

        {/* Right: Stage prompt summary */}
        <div className="hidden items-center gap-2 text-xs text-zinc-500 sm:flex">
          <span>Sub-second voice dialog · Barge-in active</span>
        </div>
      </footer>
    </div>
  );
}

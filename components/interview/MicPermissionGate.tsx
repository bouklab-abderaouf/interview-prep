"use client";

import { useState } from "react";

interface MicPermissionGateProps {
  onGranted: () => void;
}

// Phase 1 §5.2 — explains the mic request and offers a fallback for people
// who won't grant it. No real sample recording exists yet (specs §5.1 records
// the demo reel after Phase 3), so the fallback points at the sample
// scorecard instead of sample audio for now.
export function MicPermissionGate({ onGranted }: MicPermissionGateProps) {
  const [status, setStatus] = useState<"idle" | "requesting" | "denied">("idle");
  const [showFallback, setShowFallback] = useState(false);

  const requestMic = async () => {
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      onGranted();
    } catch {
      setStatus("denied");
    }
  };

  if (showFallback) {
    return (
      <div className="flex flex-col gap-3">
        <p>No mic? Here&apos;s a written sample instead.</p>
        <a href="/sample-scorecard" className="underline">
          See a sample scorecard
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p>
        This demo is a live spoken interview — it needs your microphone. Your
        voice streams directly to the model for this session only; nothing is
        recorded or stored.
      </p>
      <button
        type="button"
        onClick={requestMic}
        disabled={status === "requesting"}
        className="rounded border border-zinc-400 px-4 py-2 self-start"
      >
        {status === "requesting" ? "Requesting..." : "Allow microphone"}
      </button>
      {status === "denied" && (
        <p className="text-sm text-red-600">
          Microphone access was denied. Allow it from your browser&apos;s
          address-bar controls and try again, or continue without one.
        </p>
      )}
      <button type="button" onClick={() => setShowFallback(true)} className="text-sm underline self-start">
        Listen to a sample instead
      </button>
    </div>
  );
}

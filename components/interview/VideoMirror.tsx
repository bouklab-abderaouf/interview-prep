"use client";

import { useEffect, useRef, useState } from "react";

interface VideoMirrorProps {
  isSpeaking?: boolean;
  candidateName?: string;
  cameraEnabled?: boolean;
  onCameraToggle?: (enabled: boolean) => void;
  className?: string;
}

export function VideoMirror({
  isSpeaking = false,
  candidateName = "You (Candidate)",
  cameraEnabled = true,
  onCameraToggle,
  className = "",
}: VideoMirrorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localCameraOn, setLocalCameraOn] = useState(cameraEnabled ?? true);

  const isCameraOn = cameraEnabled !== undefined ? cameraEnabled : localCameraOn;

  const toggleCamera = () => {
    const nextState = !isCameraOn;
    setLocalCameraOn(nextState);
    onCameraToggle?.(nextState);
  };

  useEffect(() => {
    if (!isCameraOn) {
      // Release camera tracks when camera is toggled off
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      return;
    }

    let isCancelled = false;

    async function enableCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera not supported in this browser.");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          // Audio is handled separately by the Live API mic pipeline
          audio: false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setHasPermission(true);
        setErrorMessage(null);
      } catch (err) {
        if (isCancelled) return;
        console.warn("[VideoMirror] Camera access failed:", err);
        setHasPermission(false);
        setErrorMessage(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera access blocked in browser settings."
            : "No webcam available or in use by another app.",
        );
      }
    }

    void enableCamera();

    return () => {
      isCancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isCameraOn]);

  return (
    <div
      className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-zinc-900 shadow-inner ${
        isSpeaking ? "ring-2 ring-emerald-500/60 ring-offset-2 ring-offset-zinc-950" : ""
      } ${className}`}
    >
      {isCameraOn && hasPermission !== false ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover -scale-x-100"
        />
      ) : (
        /* Fallback avatar card when camera is off or denied */
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-zinc-800 to-zinc-900 p-6 text-center text-zinc-300">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-700/70 text-2xl font-semibold text-zinc-100 shadow-inner">
            {candidateName.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-200">{candidateName}</span>
            <span className="text-xs text-zinc-500">
              {errorMessage ?? "Camera is turned off"}
            </span>
          </div>
        </div>
      )}

      {/* Overlay Badge & Camera Switch */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleCamera}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur-md transition-all ${
            isCameraOn
              ? "bg-black/60 text-zinc-200 hover:bg-black/80 hover:text-white"
              : "bg-red-600/80 text-white hover:bg-red-700"
          }`}
          title={isCameraOn ? "Turn off camera" : "Turn on camera"}
        >
          {isCameraOn ? "📷 On" : "📷 Off"}
        </button>
      </div>

      {/* Bottom status strip */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1 text-xs text-zinc-300 backdrop-blur-md">
        <span
          className={`h-2 w-2 rounded-full ${
            isSpeaking ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
          }`}
        />
        <span>{candidateName}</span>
        {isSpeaking && <span className="text-[10px] text-emerald-400 font-medium">Speaking</span>}
      </div>
    </div>
  );
}

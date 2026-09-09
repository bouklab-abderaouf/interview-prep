"use client";

// The microphone has to be acquired *before* anything else a session costs.
// /session/[id] used to ask for it last — after minting an ephemeral token
// and opening the Live API socket — so a blocked mic burned a Live session
// from the free tier's very small quota on every click of Start, and
// surfaced as a bare "NotAllowedError: Permission denied" in the console.

export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    // Echo cancellation is mandatory — without it, laptop speakers feed the
    // AI's own voice back into the mic and it interrupts itself endlessly.
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  },
};

export async function requestMicrophone(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser doesn't support microphone capture.");
  }
  return navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
}

/**
 * getUserMedia's DOMException names are accurate but useless to a person
 * staring at a Start button. Note that NotAllowedError covers both "the user
 * clicked Block" and "the OS never granted the browser mic access at all",
 * which on macOS is a different settings panel entirely — so the message
 * names both.
 */
export function describeMicError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Microphone blocked. Allow it for this site from the icon in your browser's address bar, and check your OS sound/privacy settings let the browser use the mic — then press Start again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No microphone found. Connect one and press Start again.";
    case "NotReadableError":
    case "TrackStartError":
      return "Your microphone is in use by another app. Close it and press Start again.";
    case "OverconstrainedError":
      return "No microphone supports the required audio settings (mono, echo cancellation).";
    case "SecurityError":
      return "Microphone access needs a secure context — open the app over HTTPS or on localhost.";
    default:
      return error instanceof Error
        ? `Couldn't open the microphone: ${error.message}`
        : "Couldn't open the microphone.";
  }
}

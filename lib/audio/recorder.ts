"use client";

// Phase 0 §4.2 — mic capture -> 16kHz PCM16 chunks via a real AudioWorklet
// file (see the §1 gotcha: it cannot be a bundled module). Do not use
// MediaRecorder (container-wrapped Opus, not PCM) or ScriptProcessorNode
// (deprecated, main-thread, drops frames under load).

const WORKLET_URL = "/worklets/capture-processor.js";
const WORKLET_NAME = "capture-processor";

// Energy-based end-of-speech fallback for specs §4.5's t_activity_end, used
// when the server's real voiceActivityDetectionSignal isn't available
// (allowlist-gated). Mirrors the server's own silenceDurationMs so TTFA stays
// comparable to the spec's targets. rms is normalized 0..1; this threshold is
// a rough heuristic — tune against real hesitant speech, not clean audio.
const SPEECH_RMS_THRESHOLD = 0.02;
const SILENCE_HANGOVER_MS = 800;

interface WorkletChunkMessage {
  buffer: ArrayBuffer;
  rms: number;
}

export interface AudioRecorderCallbacks {
  onChunk: (base64Pcm16k: string) => void;
  /** Rising edge: quiet -> speech. Lets a caller invalidate a pending
   * onLocalActivityEnd anchor if the "end of speech" was actually just a
   * mid-sentence pause longer than SILENCE_HANGOVER_MS. */
  onLocalActivityStart?: () => void;
  /** Fallback t_activity_end signal — fires once when speech transitions to
   * ~800ms of quiet. See the constants above. */
  onLocalActivityEnd?: () => void;
  onError?: (error: unknown) => void;
}

export interface AudioRecorderHandle {
  stop: () => void;
}

export async function startRecording(
  callbacks: AudioRecorderCallbacks,
): Promise<AudioRecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // Echo cancellation is mandatory — without it, laptop speakers feed the
      // AI's own voice back into the mic and it interrupts itself endlessly.
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  });

  // Native rate (usually 48000). Do not force 16000 on the input context —
  // browsers handle it inconsistently.
  const context = new AudioContext();
  await context.audioWorklet.addModule(WORKLET_URL);

  const source = context.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(context, WORKLET_NAME);

  let speaking = false;
  let quietMs = 0;

  worklet.port.onmessage = (event: MessageEvent<WorkletChunkMessage>) => {
    const { buffer, rms } = event.data;
    callbacks.onChunk(arrayBufferToBase64(buffer));

    if (rms >= SPEECH_RMS_THRESHOLD) {
      quietMs = 0;
      if (!speaking) {
        speaking = true;
        callbacks.onLocalActivityStart?.();
      }
      return;
    }

    if (!speaking) return;

    quietMs += 100; // one chunk ≈ 100ms
    if (quietMs >= SILENCE_HANGOVER_MS) {
      speaking = false;
      quietMs = 0;
      callbacks.onLocalActivityEnd?.();
    }
  };
  worklet.onprocessorerror = (event) => callbacks.onError?.(event);

  // Deliberately not connected to context.destination — we never want to
  // hear our own mic.
  source.connect(worklet);

  return {
    stop: () => {
      worklet.port.onmessage = null;
      source.disconnect();
      worklet.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
    },
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

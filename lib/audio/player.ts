"use client";

// Phase 0 §4.3 — Gemini Live returns 24kHz PCM16, not 16kHz. A separate
// AudioContext + scheduled-queue playback, not new Audio()/<audio>.

const SAMPLE_RATE = 24000;
const SCHEDULE_LEAD_SECONDS = 0.05;

export interface AudioPlayerHandle {
  enqueue: (base64Pcm24k: string) => void;
  /** Barge-in: stop every queued source immediately (specs §4.3). */
  interrupt: () => void;
  close: () => void;
}

export function createAudioPlayer(): AudioPlayerHandle {
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  let nextStartTime = 0;
  let sources: AudioBufferSourceNode[] = [];

  return {
    enqueue(base64Pcm24k: string) {
      const pcm = base64ToInt16Array(base64Pcm24k);
      const buffer = context.createBuffer(1, pcm.length, SAMPLE_RATE);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) {
        channel[i] = pcm[i] / 0x8000;
      }

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);

      const startAt = Math.max(
        context.currentTime + SCHEDULE_LEAD_SECONDS,
        nextStartTime,
      );
      source.start(startAt);
      nextStartTime = startAt + buffer.duration;

      sources.push(source);
      source.onended = () => {
        sources = sources.filter((s) => s !== source);
      };
    },

    interrupt() {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // Already stopped/ended between the loop starting and this call.
        }
      }
      sources = [];
      nextStartTime = 0;
    },

    close() {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // Already stopped/ended.
        }
      }
      sources = [];
      void context.close();
    },
  };
}

function base64ToInt16Array(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

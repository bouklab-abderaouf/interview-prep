"use client";

// Phase 0 §4.3 — Gemini Live returns 24kHz PCM16, not 16kHz. A separate
// AudioContext + scheduled-queue playback, not new Audio()/<audio>.

const SAMPLE_RATE = 24000;
const SCHEDULE_LEAD_SECONDS = 0.05;

export interface AudioPlayerHandle {
  /** Returns when this chunk is scheduled to start playing, in
   * performance.now() time — turn timing needs when the interviewer is
   * actually heard, not when the bytes arrived. */
  enqueue: (base64Pcm24k: string) => number;
  /** When everything queued so far will have finished playing, in
   * performance.now() time (now, if nothing is queued). */
  playbackEndsAt: () => number;
  /** Current output loudness, 0–1 — drives the avatar's mouth. */
  getLevel: () => number;
  /** Barge-in: stop every queued source immediately (specs §4.3). */
  interrupt: () => void;
  close: () => void;
}

export function createAudioPlayer(): AudioPlayerHandle {
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  let nextStartTime = 0;
  let sources: AudioBufferSourceNode[] = [];

  // Every source plays through this on its way to the speakers, so the level
  // reflects exactly what the candidate hears — including a barge-in cutoff.
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  analyser.connect(context.destination);
  const levelBuffer = new Float32Array(analyser.fftSize);

  const toPerformanceTime = (contextTime: number) =>
    performance.now() + (contextTime - context.currentTime) * 1000;

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
      source.connect(analyser);

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
      return toPerformanceTime(startAt);
    },

    playbackEndsAt() {
      return toPerformanceTime(Math.max(nextStartTime, context.currentTime));
    },

    getLevel() {
      if (sources.length === 0) return 0;
      analyser.getFloatTimeDomainData(levelBuffer);
      let sum = 0;
      for (const sample of levelBuffer) sum += sample * sample;
      return Math.sqrt(sum / levelBuffer.length);
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

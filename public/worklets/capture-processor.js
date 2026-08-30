// Phase 0 §4.2 — AudioWorkletProcessor: accumulate Float32 frames at the
// context's native sample rate, downsample to 16kHz (linear interpolation —
// good enough for speech per specs §4.2), convert to Int16 LE, and post
// ~100ms (1600-sample) chunks to the main thread.
//
// Must stay a real file served from /worklets/ — see specs §1 gotcha:
// audioContext.audioWorklet.addModule() cannot load a bundled module, and a
// worklet's global scope can't import lib/audio/resample.ts, so the same
// downsample math is inlined here. Keep the two in sync if this changes.
//
// Each chunk also carries `rms` (0..1, normalized) so the main thread can run
// a simple energy-based end-of-speech heuristic — see lib/audio/recorder.ts.
// This is a fallback for specs §4.5's t_activity_end: the server's real
// "user stopped speaking" signal (voiceActivityDetectionSignal) is
// allowlist-gated and not available on every project.

const CHUNK_SAMPLES = 1600; // 100ms @ 16kHz
const TARGET_RATE = 16000;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._pending = [];
    this._srcIndex = 0;
    this._ratio = sampleRate / TARGET_RATE;
    this._outChunk = new Int16Array(CHUNK_SAMPLES);
    this._outIndex = 0;
    this._sumSquares = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this._pending.push(channel[i]);
    }

    while (this._srcIndex + 1 < this._pending.length) {
      const i0 = Math.floor(this._srcIndex);
      const frac = this._srcIndex - i0;
      const s0 = this._pending[i0];
      const s1 = this._pending[i0 + 1];
      const sample = s0 + (s1 - s0) * frac;

      const clamped = Math.max(-1, Math.min(1, sample));
      this._sumSquares += clamped * clamped;
      this._outChunk[this._outIndex++] =
        clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

      if (this._outIndex === CHUNK_SAMPLES) {
        const rms = Math.sqrt(this._sumSquares / CHUNK_SAMPLES);
        this.port.postMessage({ buffer: this._outChunk.buffer.slice(0), rms });
        this._outIndex = 0;
        this._sumSquares = 0;
      }

      this._srcIndex += this._ratio;
    }

    // Drop fully-consumed samples; keep the tail for interpolation continuity.
    const consumed = Math.floor(this._srcIndex);
    if (consumed > 0) {
      this._pending = this._pending.slice(consumed);
      this._srcIndex -= consumed;
    }

    return true;
  }
}

registerProcessor("capture-processor", CaptureProcessor);

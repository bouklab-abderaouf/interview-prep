// Phase 0 §4.2 — pure reference implementation of the downsample math used
// by public/worklets/capture-processor.js. Kept here (a) for unit testing
// outside an AudioWorkletGlobalScope and (b) as documentation of the
// algorithm; the worklet has its own inlined copy since a real AudioWorklet
// module cannot import bundler-built code (see the §1 gotcha) — keep the two
// in sync if this changes.

export function downsampleLinear(
  input: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (sourceRate === targetRate) return input;

  const ratio = sourceRate / targetRate;
  const outLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const frac = srcIndex - i0;
    const s0 = input[i0];
    const s1 = input[i0 + 1] ?? s0;
    output[i] = s0 + (s1 - s0) * frac;
  }

  return output;
}

export function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return output;
}

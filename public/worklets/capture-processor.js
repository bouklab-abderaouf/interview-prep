// Phase 0 §4.2 — AudioWorkletProcessor: accumulate Float32 frames, downsample
// 48k -> 16k, convert to Int16 LE, post ~100ms (1600-sample) chunks to the
// main thread. Must stay a real file served from /worklets/ — see specs §1
// gotcha: audioContext.audioWorklet.addModule() cannot load a bundled module.

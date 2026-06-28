/**
 * mic-frame-worklet.js — AudioWorkletProcessor for Overforge voice uplink.
 *
 * Resample + rechunk pipeline (runs inside the audio render thread):
 *
 *   Input: mono float32 at the hardware sample rate (commonly 48000 or 44100 Hz).
 *          The Web Audio API delivers 128-sample quanta but that is opaque to us.
 *
 *   Resample: fractional-position accumulator (`_pos`) steps through the input
 *             at stride = hardwareSampleRate / 16000.  The accumulator persists
 *             across process() calls so there is no discontinuity at quantum
 *             boundaries (critical for 44.1k where stride ≈ 2.756, not integer).
 *             Nearest-neighbour interpolation — sufficient quality for STT.
 *
 *   Rechunk: resampled samples accumulate in `_buf` (a 512-sample Float32 ring).
 *            When the ring is full we encode it as Int16 LE PCM and transfer a
 *            1024-byte ArrayBuffer to the main thread.  The ring carries across
 *            process() calls so every output frame is exactly 512 samples.
 *
 *   Encode: float32 in [-1, 1) → Int16 in [-32768, 32767] with hard clamping.
 */

const TARGET_RATE = 16000;
const FRAME_SAMPLES = 512;
const FRAME_BYTES = FRAME_SAMPLES * 2; // Int16 = 2 bytes/sample

class MicFrameProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // `sampleRate` is the global provided by the AudioWorklet scope — the
    // REAL hardware rate (e.g. 48000).  Never hardcode a divisor.
    this._stride = sampleRate / TARGET_RATE;
    // Fractional input cursor — persists across process() calls.
    this._pos = 0;
    // Accumulation buffer: resampled samples waiting to fill the next frame.
    this._buf = new Float32Array(FRAME_SAMPLES);
    this._filled = 0; // samples written into _buf so far
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    // Take the first channel only (getUserMedia gives us mono, but guard anyway).
    const channel = input[0];
    const inLen = channel.length;

    // Walk the input with the fractional accumulator.
    while (this._pos < inLen) {
      const sample = channel[Math.floor(this._pos)];
      this._buf[this._filled++] = sample;

      if (this._filled === FRAME_SAMPLES) {
        // Encode and post one 1024-byte frame.
        const ab = new ArrayBuffer(FRAME_BYTES);
        const view = new Int16Array(ab);
        for (let i = 0; i < FRAME_SAMPLES; i++) {
          // Clamp to [-1, 1] then scale to Int16 range.
          const clamped = Math.max(-1, Math.min(1, this._buf[i]));
          view[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
        }
        this.port.postMessage(ab, [ab]);
        this._filled = 0;
      }

      this._pos += this._stride;
    }

    // Subtract consumed input length so the cursor tracks the NEXT quantum.
    this._pos -= inLen;

    return true; // keep processor alive
  }
}

registerProcessor('mic-frame-worklet', MicFrameProcessor);

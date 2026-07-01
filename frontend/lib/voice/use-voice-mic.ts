'use client';

import { useCallback, useRef, useState } from 'react';

export type MicState = 'idle' | 'requesting' | 'granted' | 'denied' | 'error';

interface UseVoiceMicOptions {
  /** Called with each 1024-byte Int16 frame produced by the worklet. */
  onFrame: (buf: ArrayBuffer) => void;
}

interface UseVoiceMicResult {
  micState: MicState;
  /** Requests the mic and returns the FINAL state — callers must gate on this, not micState
   *  (React state is stale immediately after start() resolves). */
  start: () => Promise<MicState>;
  stop: () => void;
}

/**
 * Owns the mic lifecycle: getUserMedia → AudioContext → worklet → onFrame.
 * Idempotent: calling start() while already granted is a no-op.
 * Calling stop() releases the mic track and closes the AudioContext.
 */
export function useVoiceMic({ onFrame }: UseVoiceMicOptions): UseVoiceMicResult {
  const [micState, setMicState] = useState<MicState>('idle');

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);

  const stop = useCallback(() => {
    // Disconnect worklet
    workletRef.current?.disconnect();
    workletRef.current = null;

    // Disconnect source
    sourceRef.current?.disconnect();
    sourceRef.current = null;

    // Stop all tracks (releases the mic indicator in the browser)
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // Close audio context
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      ctxRef.current.close().catch(() => undefined);
    }
    ctxRef.current = null;

    setMicState('idle');
  }, []);

  const start = useCallback(async (): Promise<MicState> => {
    // Idempotent — already live
    if (micState === 'granted' && streamRef.current) return 'granted';

    setMicState('requesting');

    let stream: MediaStream;
    try {
      // Force Chrome's SOFTWARE echo canceller (Chrome-Wide Echo Cancellation). On macOS the browser
      // may otherwise resolve echoCancellationType to 'system' (hardware AEC), which has NO visibility
      // into in-process TTS audio and cancels nothing — the likeliest reason our self-echo leaks on
      // speakers. 'browser' references the default-output loopback so AEC can subtract our own TTS
      // from the mic. Non-standard key → typed via an extension of MediaTrackConstraints.
      const audioConstraints: MediaTrackConstraints & { echoCancellationType?: string } = {
        channelCount: 1,
        echoCancellation: true,
        echoCancellationType: 'browser',
        noiseSuppression: true,
        autoGainControl: true,
      };
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    } catch {
      setMicState('denied');
      return 'denied';
    }

    streamRef.current = stream;

    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      ctxRef.current = ctx;

      // Load the worklet script from the public directory.
      await ctx.audioWorklet.addModule('/voice/mic-frame-worklet.js');

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const worklet = new AudioWorkletNode(ctx, 'mic-frame-worklet');
      workletRef.current = worklet;

      // Each message is a 1024-byte ArrayBuffer (transferred — zero-copy).
      worklet.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
        onFrame(ev.data);
      };

      source.connect(worklet);
      // Connect the worklet to the destination so the render graph actually PULLS audio through it.
      // A worklet with no path to the destination may never have process() invoked (Chromium), so
      // NO frames are produced and the candidate's speech is silently never captured ("spoke,
      // nothing appeared"). The worklet writes nothing to its output buffer, so this routes SILENCE
      // to the speakers — there is no mic playback.
      worklet.connect(ctx.destination);

      // A fresh AudioContext can start 'suspended' (the begin() await can consume the user gesture),
      // which would also stall the audio thread — resume so frames actually flow.
      await ctx.resume().catch(() => undefined);

      setMicState('granted');
      return 'granted';
    } catch {
      // AudioContext or worklet failed — release the stream and surface error.
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (ctxRef.current && ctxRef.current.state !== 'closed') {
        ctxRef.current.close().catch(() => undefined);
      }
      ctxRef.current = null;
      setMicState('error');
      return 'error';
    }
  }, [micState, onFrame]);

  return { micState, start, stop };
}

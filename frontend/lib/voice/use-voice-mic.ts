'use client';

import { useCallback, useRef, useState } from 'react';

export type MicState = 'idle' | 'requesting' | 'granted' | 'denied' | 'error';

interface UseVoiceMicOptions {
  /** Called with each 1024-byte Int16 frame produced by the worklet. */
  onFrame: (buf: ArrayBuffer) => void;
}

interface UseVoiceMicResult {
  micState: MicState;
  start: () => Promise<void>;
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

  const start = useCallback(async () => {
    // Idempotent — already live
    if (micState === 'granted' && streamRef.current) return;

    setMicState('requesting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      setMicState('denied');
      return;
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
      // Do NOT connect worklet to ctx.destination — we don't want mic playback.

      setMicState('granted');
    } catch {
      // AudioContext or worklet failed — release the stream and surface error.
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (ctxRef.current && ctxRef.current.state !== 'closed') {
        ctxRef.current.close().catch(() => undefined);
      }
      ctxRef.current = null;
      setMicState('error');
    }
  }, [micState, onFrame]);

  return { micState, start, stop };
}

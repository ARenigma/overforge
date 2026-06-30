'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { sendProctorSignal } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CameraState = 'idle' | 'requesting' | 'granted' | 'denied' | 'error';

interface WorkerResult {
  faceCount: number;
  lookingAway: boolean;
}

interface WindowAccumulator {
  startMs: number;
  samples: number;
  faceAbsentMs: number;
  multiFaceMs: number;
  gazeOffMs: number;
  maxFaces: number;
}

interface UseCameraProctorOptions {
  interviewId: string;
  token: string | null;
}

interface UseCameraProctorResult {
  cameraState: CameraState;
  start: () => Promise<void>;
  stop: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** How often we sample a frame from the camera (ms). 1 fps is sufficient. */
const SAMPLE_INTERVAL_MS = 1000;

/** How long each reporting window lasts before we flush a signal (ms). */
const WINDOW_MS = 15_000;

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Owns the camera lifecycle for proctoring:
 *   1. getUserMedia (video only, no audio) on explicit start().
 *   2. Samples one frame per second to an offscreen canvas.
 *   3. Posts frames to a Web Worker running MediaPipe FaceLandmarker.
 *   4. Aggregates results into ~15s windows, then fires sendProctorSignal.
 *
 * PRIVACY guarantee: no ImageBitmap, canvas data, or pixel buffer is ever
 * sent outside this hook. Only the numeric aggregates are transmitted.
 *
 * Graceful degradation: if the worker or MediaPipe model fails to load,
 * cameraState remains 'granted' (camera is still running, the room is not
 * blocked) but signals are simply not produced.
 */
export function useCameraProctor({
  interviewId,
  token,
}: UseCameraProctorOptions): UseCameraProctorResult {
  const [cameraState, setCameraState] = useState<CameraState>('idle');

  // Refs for resources that need cleanup
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const canvasRef = useRef<OffscreenCanvas | null>(null);
  const ctxRef = useRef<OffscreenCanvasRenderingContext2D | null>(null);
  const sampleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const windowTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Accumulator for the current window
  const accumRef = useRef<WindowAccumulator>(newWindow());

  // Track whether a frame is currently in-flight to the worker (avoid queuing)
  const framePendingRef = useRef(false);

  function newWindow(): WindowAccumulator {
    return {
      startMs: Date.now(),
      samples: 0,
      faceAbsentMs: 0,
      multiFaceMs: 0,
      gazeOffMs: 0,
      maxFaces: 0,
    };
  }

  /** Flush the current accumulator window to the backend. */
  const flushWindow = useCallback(() => {
    const acc = accumRef.current;
    const windowMs = Date.now() - acc.startMs;

    // Only send if we actually had samples; skip empty windows (e.g. tab hidden).
    if (acc.samples > 0 && token) {
      sendProctorSignal(interviewId, token, {
        windowMs,
        samples: acc.samples,
        faceAbsentMs: acc.faceAbsentMs,
        multiFaceMs: acc.multiFaceMs,
        gazeOffMs: acc.gazeOffMs,
        maxFaces: acc.maxFaces,
      });
    }

    // Reset for the next window.
    accumRef.current = newWindow();
  }, [interviewId, token]);

  /** Handle a result message from the face-detect worker. */
  const handleWorkerMessage = useCallback((ev: MessageEvent<WorkerResult | { type: string }>) => {
    framePendingRef.current = false;

    // Ignore non-result messages (type: 'ready', type: 'init_failed', etc.)
    const data = ev.data as Record<string, unknown>;
    if (typeof data.type === 'string') {
      if (data.type === 'init_failed')
        console.warn('[proctor] MediaPipe failed to initialise — no signals will be produced');
      return;
    }

    const result = ev.data as WorkerResult;
    const acc = accumRef.current;

    acc.samples += 1;
    if (result.faceCount === 0) acc.faceAbsentMs += SAMPLE_INTERVAL_MS;
    if (result.faceCount > 1) acc.multiFaceMs += SAMPLE_INTERVAL_MS;
    if (result.lookingAway) acc.gazeOffMs += SAMPLE_INTERVAL_MS;
    if (result.faceCount > acc.maxFaces) acc.maxFaces = result.faceCount;
  }, []);

  /** Sample one frame from the video and post it to the worker. */
  const sampleFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const worker = workerRef.current;

    if (!video || !canvas || !ctx || !worker) return;
    if (video.readyState < 2) return; // video not ready yet
    if (framePendingRef.current) return; // previous frame still in worker

    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      // createImageBitmap from an OffscreenCanvas is available in workers but
      // we are on the main thread here — use transferToImageBitmap() instead.
      const bitmap = canvas.transferToImageBitmap();
      framePendingRef.current = true;
      // Transfer ownership to avoid a copy; the worker closes the bitmap.
      worker.postMessage({ frame: bitmap }, [bitmap]);
    } catch {
      // Canvas capture or transfer failed — skip this sample silently.
      framePendingRef.current = false;
    }
  }, []);

  const stop = useCallback(() => {
    // Flush any partial window before stopping.
    if (accumRef.current.samples > 0) flushWindow();

    if (sampleTimerRef.current !== null) {
      clearInterval(sampleTimerRef.current);
      sampleTimerRef.current = null;
    }
    if (windowTimerRef.current !== null) {
      clearInterval(windowTimerRef.current);
      windowTimerRef.current = null;
    }

    workerRef.current?.terminate();
    workerRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.remove();
      videoRef.current = null;
    }

    canvasRef.current = null;
    ctxRef.current = null;
    framePendingRef.current = false;
    accumRef.current = newWindow();

    setCameraState('idle');
  }, [flushWindow]);

  const start = useCallback(async () => {
    // Idempotent — already live
    if (cameraState === 'granted' && streamRef.current) return;

    setCameraState('requesting');

    // 1. Request camera access (must be called within a user gesture).
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
    } catch {
      setCameraState('denied');
      return;
    }

    streamRef.current = stream;

    // 2. Attach stream to a hidden but DOM-CONNECTED video element. A detached (not-in-DOM)
    // video does NOT reliably decode frames in Chrome — readyState stays < 2 and drawImage
    // captures nothing, so no frame ever reaches the worker (this produced zero signals in the
    // first prod test). Connect it offscreen with near-zero size; NOT display:none, which also
    // pauses decoding.
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    video.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(video);
    videoRef.current = video;

    try {
      await video.play();
    } catch {
      // Autoplay failed — camera is technically granted but sampling won't work.
      // Keep cameraState 'granted' so the room isn't blocked; signals just won't fire.
    }

    // 3. Create offscreen canvas for frame capture.
    try {
      const canvas = new OffscreenCanvas(640, 480);
      const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
      if (!ctx) throw new Error('no 2d ctx');
      canvasRef.current = canvas;
      ctxRef.current = ctx;
    } catch {
      // OffscreenCanvas not supported — mark granted, no signals.
      setCameraState('granted');
      return;
    }

    // 4. Spin up the face-detect Web Worker.
    // Graceful: if the worker fails to load (no CDN, CSP block, etc.) we still
    // set cameraState 'granted' so the room isn't blocked.
    try {
      // type:'module' so the worker's dynamic import() of the MediaPipe ESM bundle works across
      // browsers (classic workers don't support dynamic import in Firefox/Safari).
      const worker = new Worker('/vision/face-detect-worker.js', { type: 'module' });
      worker.onmessage = handleWorkerMessage;
      worker.onerror = (e) => {
        console.warn('[proctor] face-detect worker error — no signals will be produced', e.message);
        // Worker crashed — stop timers but keep cameraState 'granted'.
        if (sampleTimerRef.current !== null) clearInterval(sampleTimerRef.current);
        if (windowTimerRef.current !== null) clearInterval(windowTimerRef.current);
        sampleTimerRef.current = null;
        windowTimerRef.current = null;
        workerRef.current = null;
      };
      workerRef.current = worker;
    } catch {
      // Worker instantiation failed — camera granted, no proctoring.
      setCameraState('granted');
      return;
    }

    // 5. Start sampling + windowed flush.
    sampleTimerRef.current = setInterval(sampleFrame, SAMPLE_INTERVAL_MS);
    windowTimerRef.current = setInterval(flushWindow, WINDOW_MS);

    setCameraState('granted');
  }, [cameraState, handleWorkerMessage, sampleFrame, flushWindow]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { cameraState, start, stop };
}

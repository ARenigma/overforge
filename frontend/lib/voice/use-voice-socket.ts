'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ServerBargeIn,
  ServerIntegrity,
  ServerReady,
  ServerThinking,
  ServerTurnReady,
  ServerError,
  ServerClosing,
  VoiceCue,
} from './types';

const VOICE_WS_URL = process.env.NEXT_PUBLIC_VOICE_WS_URL ?? '';

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 500;

interface UseVoiceSocketOptions {
  interviewId: string;
  token: string | null;
  enabled: boolean;
  onReady: (cue: ServerReady) => void;
  onThinking: (cue: ServerThinking) => void;
  onTurnReady: (cue: ServerTurnReady) => void;
  onError: (cue: ServerError) => void;
  onClosing: (cue: ServerClosing) => void;
  /** Called when the server signals the candidate interrupted the interviewer mid-speech. */
  onBargeIn: (cue: ServerBargeIn) => void;
  /** Called when all retry attempts are exhausted — caller reverts to typed mode. */
  onFatal: () => void;
  /** Called when the server pushes an integrity event (e.g. second_voice detected by VAD).
   *  Optional — unknown integrity kinds must be tolerated gracefully. */
  onIntegrity?: (cue: ServerIntegrity) => void;
}

export type SocketStatus = 'disconnected' | 'connecting' | 'ready' | 'failed';

interface UseVoiceSocketResult {
  socketStatus: SocketStatus;
  sendFrame: (buf: ArrayBuffer) => void;
  sendSpoken: (requestId: string, firstAudioMs?: number | null) => void;
  sendMicOff: () => void;
  disconnect: () => void;
}

/**
 * Owns the WebSocket connection to the Python voice service.
 * Sends hello on open, waits for ready, then exposes frame/spoken/mic_off senders.
 * Reconnects with exponential backoff (cap MAX_RETRIES); calls onFatal when exhausted.
 */
export function useVoiceSocket({
  interviewId,
  token,
  enabled,
  onReady,
  onThinking,
  onTurnReady,
  onError,
  onClosing,
  onBargeIn,
  onFatal,
  onIntegrity,
}: UseVoiceSocketOptions): UseVoiceSocketResult {
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('disconnected');

  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep callbacks in refs so the stable connect() closure always calls the latest version.
  const onReadyRef = useRef(onReady);
  const onThinkingRef = useRef(onThinking);
  const onTurnReadyRef = useRef(onTurnReady);
  const onErrorRef = useRef(onError);
  const onClosingRef = useRef(onClosing);
  const onBargeInRef = useRef(onBargeIn);
  const onFatalRef = useRef(onFatal);
  const onIntegrityRef = useRef(onIntegrity);
  const tokenRef = useRef(token);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    onThinkingRef.current = onThinking;
  }, [onThinking]);
  useEffect(() => {
    onTurnReadyRef.current = onTurnReady;
  }, [onTurnReady]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onClosingRef.current = onClosing;
  }, [onClosing]);
  useEffect(() => {
    onBargeInRef.current = onBargeIn;
  }, [onBargeIn]);
  useEffect(() => {
    onFatalRef.current = onFatal;
  }, [onFatal]);
  useEffect(() => {
    onIntegrityRef.current = onIntegrity;
  }, [onIntegrity]);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const sendJson = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'bye' }));
      ws.close(1000, 'bye');
    } else if (ws) {
      ws.close();
    }
    wsRef.current = null;
    setSocketStatus('disconnected');
  }, []);

  const connect = useCallback(() => {
    if (!VOICE_WS_URL || !tokenRef.current) return;

    intentionalCloseRef.current = false;
    setSocketStatus('connecting');

    const url = `${VOICE_WS_URL}/ws/interview/${interviewId}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      retriesRef.current = 0;
      ws.send(JSON.stringify({ type: 'hello', token: tokenRef.current }));
      // Status stays 'connecting' until we receive {ready}
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return; // ignore any unexpected binary from server

      let cue: VoiceCue;
      try {
        cue = JSON.parse(ev.data) as VoiceCue;
      } catch {
        return;
      }

      switch (cue.type) {
        case 'ready':
          setSocketStatus('ready');
          onReadyRef.current(cue);
          break;
        case 'thinking':
          onThinkingRef.current(cue);
          break;
        case 'turn_ready':
          onTurnReadyRef.current(cue);
          break;
        case 'error':
          onErrorRef.current(cue);
          break;
        case 'closing':
          onClosingRef.current(cue);
          break;
        case 'barge_in':
          onBargeInRef.current(cue);
          break;
        case 'integrity':
          onIntegrityRef.current?.(cue);
          break;
        // Unknown types are silently ignored — the socket must never break on forward-compat cues.
      }
    };

    ws.onclose = (ev) => {
      wsRef.current = null;
      if (intentionalCloseRef.current) {
        setSocketStatus('disconnected');
        return;
      }

      // 4401 = unauthorized, 4403 = origin denied, 4409 = not in progress — don't retry
      const noRetry = [4401, 4403, 4409].includes(ev.code);
      if (noRetry || retriesRef.current >= MAX_RETRIES) {
        setSocketStatus('failed');
        onFatalRef.current();
        return;
      }

      retriesRef.current++;
      const delay = Math.min(BASE_BACKOFF_MS * 2 ** (retriesRef.current - 1), 16_000);
      setSocketStatus('connecting');
      retryTimerRef.current = setTimeout(() => {
        if (!intentionalCloseRef.current) connect();
      }, delay);
    };

    ws.onerror = () => {
      // onclose fires after onerror — let it handle retry logic
    };
  }, [interviewId]); // interviewId is stable; token/callbacks via refs

  // Connect when enabled; disconnect when disabled or unmounted.
  useEffect(() => {
    if (!enabled || !VOICE_WS_URL || !token) return;
    connect();
    return () => {
      intentionalCloseRef.current = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      const ws = wsRef.current;
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'bye' }));
          ws.close(1000, 'bye');
        } else {
          ws.close();
        }
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token]);

  const sendFrame = useCallback((buf: ArrayBuffer) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(buf);
    }
  }, []);

  const sendSpoken = useCallback(
    (requestId: string, firstAudioMs?: number | null) => {
      const msg: Record<string, unknown> = { type: 'spoken', requestId };
      if (firstAudioMs != null) msg.firstAudioMs = firstAudioMs;
      sendJson(msg);
    },
    [sendJson]
  );

  const sendMicOff = useCallback(() => {
    sendJson({ type: 'mic_off' });
  }, [sendJson]);

  return { socketStatus, sendFrame, sendSpoken, sendMicOff, disconnect };
}

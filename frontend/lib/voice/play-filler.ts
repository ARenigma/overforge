'use client';

import type { MutableRefObject } from 'react';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

/**
 * Plays the filler audio for a thinking cue.
 *
 * Behaviour:
 * - POSTs to /api/interviews/:id/filler with the session token.
 * - Plays the returned WAV blob via a transient Audio element.
 * - Gated by speakSeqRef: increments the ref's local snapshot before play;
 *   if a newer turn/speak() bumped the ref before or during playback the filler
 *   is cancelled silently — same pattern the room uses for TTS chunks.
 * - Best-effort: 503, network errors, and autoplay rejection are all silent no-ops.
 *   Never throws.
 */
export async function playFiller(
  id: string,
  token: string,
  speakSeqRef: MutableRefObject<number>
): Promise<void> {
  const seq = ++speakSeqRef.current;

  let blob: Blob;
  try {
    const res = await fetch(`${BASE_URL}/api/interviews/${id}/filler`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) return; // 503 = voice off, 404 = no filler — silent no-op
    blob = await res.blob();
  } catch {
    return; // network error — silent no-op
  }

  // A newer cue already arrived while we were fetching — discard.
  if (seq !== speakSeqRef.current) return;

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  await new Promise<void>((resolve) => {
    const done = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.addEventListener('ended', done, { once: true });
    audio.addEventListener('error', done, { once: true });

    // Check the seq guard once more right before play — a turn_ready could have
    // arrived between the blob fetch and now.
    if (seq !== speakSeqRef.current) {
      URL.revokeObjectURL(url);
      resolve();
      return;
    }

    audio.play().catch(() => {
      URL.revokeObjectURL(url);
      resolve();
    });
  });
}

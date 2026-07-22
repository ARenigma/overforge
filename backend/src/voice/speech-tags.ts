// Shared speech-tag helpers — importable from both voice/ and interview/ without circular deps.
//
// Grok TTS supports a whitelist of inline and wrapping tags for expressiveness.
// All other tag-shaped text (hallucinated / unsupported tags) must be stripped so they are
// never spoken aloud as words. Display and persistence paths strip ALL tags — the candidate
// must never see [pause] in a chat bubble or stored transcript.
//
// Two APIs:
//   sanitizeSpeechTags(text) — for Grok TTS input: allow whitelist, strip everything else
//   stripSpeechTags(text)   — for display / persistence / Cartesia: remove ALL tags

/** Whitelisted Grok inline tags (e.g. [pause]). */
const WHITELISTED_INLINE = new Set(['pause', 'long-pause', 'sigh', 'laugh', 'chuckle']);

/** Whitelisted Grok wrapping tag names (e.g. <soft>...</soft>). */
const WHITELISTED_WRAP = new Set(['soft', 'slow', 'whisper', 'loud', 'fast', 'happy', 'sad']);

/**
 * Sanitize speech tags for Grok TTS input.
 *
 * Preserves whitelisted inline tags: [pause], [long-pause], [sigh], [laugh], [chuckle].
 * Preserves whitelisted wrapping tags: <soft>, <slow>, <whisper>, <loud>, <fast>, <happy>, <sad>.
 * Strips any other tag-shaped content — hallucinated or unsupported tags must never be spoken
 * as words by Grok TTS.
 */
export function sanitizeSpeechTags(text: string): string {
  return text
    .replace(/\[([^\]]*)\]/g, (_match: string, name: string) =>
      WHITELISTED_INLINE.has(name.trim().toLowerCase()) ? `[${name}]` : ''
    )
    .replace(/<\/?([a-zA-Z][\w-]*)>/g, (match: string, name: string) =>
      WHITELISTED_WRAP.has(name.trim().toLowerCase()) ? match : ''
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Strip ALL speech tags from text — for display / persistence / Cartesia TTS.
 *
 * Removes every [inline-tag] and <wrapping-tag>, regardless of whitelist status.
 * The candidate must never see speech-tag notation in a chat bubble or stored transcript.
 * Cartesia TTS only understands its own <break>/<spell> syntax, so Grok tags must be stripped
 * before sending text to Cartesia.
 */
export function stripSpeechTags(text: string): string {
  return text
    .replace(/\[([^\]]*)\]/g, '')
    .replace(/<\/?([a-zA-Z][\w-]*)>/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

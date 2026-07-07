/*
 * Single source of truth for reading design tokens in JS / canvas / WebGL.
 *
 * The canonical values live in CSS tokens (app/globals.css). This reads them at
 * runtime so non-CSS surfaces (the WebGL hero) never hardcode hex and always
 * track the active light/dark theme. Change the token, everything follows.
 */

function readToken(name: string, fallback: string, scope?: Element | null): string {
  if (typeof window === 'undefined') return fallback;
  const root = scope ?? document.documentElement;
  const triplet = getComputedStyle(root).getPropertyValue(name).trim();
  if (!triplet) return fallback;
  const [h, s, l] = triplet.split(/\s+/);
  return `hsl(${h}, ${s}, ${l})`;
}

/** Neutral foreground color — for the monochrome hero dot texture (Supabase-style). */
export function dotColorCss(scope?: Element | null): string {
  return readToken('--foreground', 'hsl(0, 0%, 92%)', scope);
}

/** Brand accent (ultramarine trace) for non-CSS surfaces (e.g. the CodeMirror caret/selection).
 *  Reads --primary at runtime so the brand stays defined in one place and tracks the active theme.
 *  Pass alpha (0-1) for a translucent variant, e.g. accentColorCss(0.18). */
export function accentColorCss(alpha?: number, scope?: Element | null): string {
  const fallback = '226 100% 62%';
  const triplet =
    typeof window === 'undefined'
      ? fallback
      : getComputedStyle(scope ?? document.documentElement)
          .getPropertyValue('--primary')
          .trim() || fallback;
  if (alpha != null) return `hsl(${triplet} / ${alpha})`;
  const [h, s, l] = triplet.split(/\s+/);
  return `hsl(${h}, ${s}, ${l})`;
}

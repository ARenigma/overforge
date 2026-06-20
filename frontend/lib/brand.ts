/*
 * Single source of truth for the brand accent in JS / canvas / WebGL contexts.
 *
 * The canonical value lives in the CSS token `--primary` (app/globals.css). This
 * reads it at runtime so non-CSS surfaces (the WebGL hero, canvas, SVG built in
 * JS) never hardcode the hex. Change the brand in ONE place — the token — and
 * everything, including the hero, follows. It also tracks the active light/dark
 * theme automatically, since `--primary` differs per mode.
 */

const FALLBACK_ACCENT = 'hsl(153, 61%, 53%)'; // mirrors --primary (dark) = #3ECF8E

/** The brand accent as a CSS color string (e.g. "hsl(153, 61%, 53%)"). */
export function brandAccentCss(scope?: Element | null): string {
  if (typeof window === 'undefined') return FALLBACK_ACCENT;
  const root = scope ?? document.documentElement;
  const triplet = getComputedStyle(root).getPropertyValue('--primary').trim();
  if (!triplet) return FALLBACK_ACCENT;
  const [h, s, l] = triplet.split(/\s+/);
  return `hsl(${h}, ${s}, ${l})`;
}

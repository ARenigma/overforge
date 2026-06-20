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

/** Brand accent (cyber-green) as a CSS color string. */
export function brandAccentCss(scope?: Element | null): string {
  return readToken('--primary', 'hsl(153, 61%, 53%)', scope);
}

/** Neutral foreground color — for the monochrome hero dot texture (Supabase-style). */
export function dotColorCss(scope?: Element | null): string {
  return readToken('--foreground', 'hsl(0, 0%, 92%)', scope);
}

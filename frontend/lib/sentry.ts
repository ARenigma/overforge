// Sentry DSN for the Finite frontend.
//
// A DSN is NOT a secret — it only permits SENDING events to this project (never reading them),
// and it necessarily ships in the browser bundle. Sentry's own Next.js setup commits it, so this
// is the conventional home for it.
//
// Resolution order:
//   1. NEXT_PUBLIC_SENTRY_DSN (explicit env) — always wins, so ops can repoint or disable without
//      a code change (e.g. set it in Vercel to override the baked value).
//   2. The baked PUBLIC_DSN — used ONLY in production builds, so local `next dev` stays silent
//      (no dev noise polluting the project) unless a dev explicitly opts in via the env var.
const PUBLIC_DSN =
  'https://ae3458a2350decb20ad064782b8cc6db@o4511723259297792.ingest.de.sentry.io/4511723272798288';

export const SENTRY_DSN: string | undefined =
  process.env.NEXT_PUBLIC_SENTRY_DSN ??
  (process.env.NODE_ENV === 'production' ? PUBLIC_DSN : undefined);

// Tag events with the deploy environment. VERCEL_ENV distinguishes preview from production when
// exposed as NEXT_PUBLIC_; otherwise fall back to NODE_ENV.
export const SENTRY_ENV: string =
  process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'production';

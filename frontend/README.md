# Overforge Frontend

Next.js 14 App Router frontend for the Finite AI interview platform.

## Stack

- **Framework**: Next.js 14 (App Router, SSR middleware auth)
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS + custom design-system tokens
- **Code editor**: CodeMirror (interview room)
- **Auth**: Supabase Auth (`@supabase/ssr` SSR session gating)
- **UI primitives**: shadcn/ui (Radix)

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/auth/*` | Supabase Auth flows |
| `/dashboard` | Interviewer dashboard — create/track interviews, scorecards |
| `/interview/[id]` | Interview room — CodeMirror editor + AI comms widget |

## Local dev

```bash
cp frontend/.env.example frontend/.env.local   # fill in values
cd frontend && npm run dev                     # port 3000
```

## Environment variables

See `frontend/.env.example` for the full list with comments. Required for local dev:

```
NEXT_PUBLIC_API_URL          # backend origin (http://localhost:5001 locally)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Optional:
```
NEXT_PUBLIC_VOICE_WS_URL     # Python voice service (ws://localhost:5002 locally)
NEXT_PUBLIC_SENTRY_DSN
NEXT_PUBLIC_TTS_STREAM
NEXT_PUBLIC_CAL_LINK
NEXT_PUBLIC_SITE_URL
```

Vercel-injected (do not set locally):
```
NEXT_PUBLIC_VERCEL_ENV
NEXT_PUBLIC_VERCEL_URL
```

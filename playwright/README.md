# Overforge — automated candidate-mimic (Playwright)

A real headed Chromium drives the **entire interview exactly as a candidate would**: it clears the
camera + microphone consent gate (via fake-media), answers the oral round by typing into the room's
always-on composer (which drives the identical server FSM as voice), then in the coding round reads
the assigned problem, writes code into CodeMirror, and clicks RUN. A second spec proves the voice
path by feeding a spoken clip to the fake microphone so the real STT transcribes it.

This is a standalone package — **not** part of the npm workspace. Install and run from this dir.

## Why text-driven (with a separate voice smoke)

The FSM advances identically whether an answer arrives via `POST /answer` (text composer) or the
voice WebSocket — both hit the same orchestrator handler. Driving the oral round by text makes the
full-interview regression **deterministic and CI-portable** (no timing-brittle audio concatenation,
no OS virtual-audio devices). The voice path gets its own focused smoke test (`stt-smoke`) with a
single spoken clip, so STT is still exercised end-to-end without making every run depend on it.

## Setup

```bash
cd playwright
npm install
npm run install:browser        # playwright install chromium
npm run fixtures               # optional media (see Fixtures)
```

### Required config (env / CI secrets)

| Var                | Purpose                                              | Default |
| ------------------ | ---------------------------------------------------- | --- |
| `OF_TEST_PASSWORD` | Password for the dev interviewer account (**secret**) | — (required) |
| `OF_TEST_EMAIL`    | Dev account (must be in the backend's `DEV_EMAILS`)  | `dev@overforge.local` |
| `OF_API_URL`       | Backend REST base                                    | `https://140.245.14.50.sslip.io` |
| `OF_SUPABASE_URL`  | Supabase project URL (public)                        | ← `frontend/.env.local` |
| `OF_SUPABASE_ANON_KEY` | Supabase anon key (public)                       | ← `frontend/.env.local` |

The candidate frontend URL is **not** configured here — the harness opens the invite `link` the
backend returns (built from the backend's `FRONTEND_URL`), so it always targets the right origin.

The dev account creates `devMode` interviews: paste is allowed (so the editor can be filled) and the
short dev duration applies. `devMode` is server-authoritative — only honored for a `DEV_EMAILS`
account, never on the client's say-so.

## Run

```bash
OF_TEST_PASSWORD=… npm run test:mimic     # flagship full-interview mimic (headed)
OF_TEST_PASSWORD=… npm run test:stt       # voice/STT smoke (needs fixtures/answer.wav)
HEADLESS=1 OF_TEST_PASSWORD=… npm test    # both, headless
npm run report                            # open the last HTML report (CI)
```

## Fixtures (`make-fixtures.sh`, all optional)

- **`silence.wav`** — silent mic for the text-driven mimic, so the voice STT path can't race the
  composer. Absent → the default fake device (a tone) is used; harmless for a text run.
- **`face.y4m`** — a headshot clip so MediaPipe's proctor registers a face. Drop a real frontal
  `fixtures/face.jpg` first. Absent → the proctor notes `faceAbsent` but the interview still
  proceeds (proctoring is fire-and-forget, never a gate).
- **`answer.wav`** — a spoken answer (3s leading silence to clear the AEC warm-up, then speech,
  48 kHz mono s16). Generated with macOS `say`; on Linux CI provide your own TTS clip. Absent →
  the STT smoke test skips.

Binaries are gitignored — generate locally or ship as CI artifacts.

## CI

Run the `mimic` project on every backend/frontend change; headed under `xvfb-run` on Linux (the
Linux sandbox is fine — drop the macOS-only `--no-sandbox`). Keep `stt` as a separate/nightly job
since it depends on a spoken fixture + live STT. Provide `OF_TEST_PASSWORD` + the Supabase publics
as CI variables.

## What it asserts

- Consent gate cleared (camera/mic granted via fake-media, room entered).
- Interviewer greets; oral answers advance the FSM to the coding phase.
- The assigned coding problem is shown (statement only).
- Code is written into CodeMirror and RUN executes, returning a status.
- **Leak invariant:** the candidate view never shows hidden-test pass/fail.
- The interview reaches a terminal state (completion or the dev time cap).

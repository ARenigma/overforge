# FINITE — Design System Master Plan
**v1.0 — the definitive spec for the Overforge → Finite rebrand.** Marketing shell + token rebrand; room/dashboard logic untouched. Every decision below is final unless Amit overrides.

---

## 1. BRAND CONCEPT — "Finite"

**Narrative.** Every other AI interviewer is an infinite object: an unbounded LLM improvising in a loop, unauditable, different every run. Finite's product truth is the opposite — an FSM with a countable set of states, deterministic transitions, and a guaranteed terminal state. The brand states it plainly: *infinite candidates, finite answers*. Positioning inverts the category the way Hyperbolic inverted "dark dev startup" for GPU compute: **we are the auditable one**, so we are light-first, spec-sheet honest, and every claim carries a unit (together.ai's discipline: nothing ships without a number and a source).

**Voice.** Engineering nouns, zero AI-hype adjectives (Fauna Robotics: "Compliant, capable locomotion" — trust via concrete nouns). Feature labels are three-word noun phrases: "Deterministic probing." "Sandboxed execution." "Auditable scoring." Tilde-prefixed spec numbers everywhere: `~1s VOICE LATENCY`, `97/97 HIDDEN TESTS`, `0 SCORE VARIANCE` (Serve Robotics' `~0 G/KM` counters — the tilde reads as engineering honesty). Never "AI-powered." Never an exclamation mark.

**Visual metaphors (the canon — these five, no others):**
1. **The FSM graph** — nodes and directed edges. Used as: hero animation, page-scroll structure (NRG's five-phase graph walk), background pattern family (Hyperbolic derived patterns from hyperboloids; we derive ours from actual state-machine topology — pattern = product math, not decoration).
2. **The accepting state** — automata theory's double-circle terminal node. This is the logo's core glyph and the punctuation of the brand (the period in "finite.").
3. **The clipped loop** — a mobius/∞ band that is cut and terminates: infinite input, finite resolution (together.ai's hero render metaphor — the ribbon clipped into discrete blocks).
4. **The ledger** — mono-typeset transition logs, numbered indexes (`INT / 03`, `STATE 04 / 12`), blueprint hairline grids. MONOLOG's typographic counter grammar; Sui's 01–06 module indexing.
5. **Settling motion** — everything converges. Fast attack, decisive settle, stable end state.

**"Resolves to a stable state" as brand behavior (hard rule).** Every animation on the site terminates in an accepting state: reveals settle and stop, counters count once, hovers snap to a new stable state (never breathe/pulse), progress bars are *linear* (ease:none — clock-like, deterministic; together.ai's story-bar tabs), and the only permitted loops are the edge-masked logo/language marquee and the 12px terminal blink caret. No yoyo, no infinite pulse, no floating idle animations. The loader is the logo tracing itself to completion (EverSwap/Lusion: loader dissolves into hero in one continuous shot) — "no spinner, ever" is a brand law, because latency theater is the product.

---

## 2. LOGO DIRECTION

**Concept A — "Accepting State" (PRIMARY, ship this).**
The textbook automata symbol for a terminal state, fused with the loop that reaches it.
- **Geometry:** 24×24 grid. One open circular arc (~300°, r=9, centered 12,12), stroke-width 2 (2.5 below 20px), `stroke-linecap="round"`, drawn counter-clockwise, whose endpoint lands on a **double-circle node** (outer ring r=3.5 stroke 1.5, inner filled dot r=1.75) sitting on the arc at 4 o'clock. A loop that *ends* — the FSM accepting state, literally.
- **SVG construction:** single `<path>` for the arc + `<circle>` ×2 for the node. Currentcolor stroke; node dot in `--primary`.
- **Load animation:** arc draws via `pathLength="1"` + `stroke-dashoffset` 1→0, 700ms `expo.out`; node ring scales 0→1 with one `back.out(1.4)` overshoot, then *stops dead* (settling motion = brand). Total ≤ 900ms. This same animation is the app loader.
- **Favicon reduction:** at 16px, drop the arc to a 90° hint and keep only the double-circle node — reads perfectly at any size. Ship as `app/favicon.ico` (32px raster), `app/icon.svg` with an embedded `prefers-color-scheme` media query flipping stroke ink↔paper (tech-stack lane: free dark-tab adaptation), `app/apple-icon.png` on the ink background. This kills the current CRA React-atom favicon (audit: `public/favicon.ico` is byte-for-byte the create-react-app default — fix in phase 0).

**Concept B — "Clipped Infinity" (motion/3D motif, not the mark).**
A mobius figure-eight where the right lobe is severed and terminates in a squared endpoint node — infinity clipped to finite. Two cubic-bezier lobes, left closed, right open with `stroke-linecap="square"`. Too complex at favicon size; reserved as the 3D hero object and the full-screen footer moment (§6d).

**Concept C — "F-machine" monogram (REJECTED).** An F built from 3 nodes + 2 edges. Reads generic fintech; killed.

**Wordmark:** `finite.` — lowercase, Geist Sans 500, -0.02em tracking, with the **terminal period set in `--primary`**. The full stop is the accepting state; the sentence ends. In lockup, mark sits left of wordmark at cap-height, 0.5× cap-height gap. Never all-caps, never bold.

---

## 3. COLOR TOKEN SYSTEM — "BLUELINE"

**Name + rationale.** A *blueline* is the print industry's final pre-press proof — the last deterministic check before something ships. The palette is engineering paper + drafting ink + one ultramarine trace pen. Light mode is the native mode (blueprints, graph paper, spec sheets live on paper); dark mode is the same drawing photographed at night.

**Why ultramarine and not another hue (decision, lanes disagreed):** Supabase-green is claimed and would read as a clone; violet is Hyperbolic's; ember is explicitly retired; the June/July SOTD yellows (#FDEB07/#FFC20E) fail as text on white and read fashion-forward rather than trustworthy; mint is crypto. A deep ultramarine trace on warm-cool paper is the drafting-pen register — precise, auditable, institutional — and it is defensible against "generic SaaS blue" because it appears in <5% of pixels (together.ai's rationing rule), always as the trace/CTA/data color, never as washes or gradients.

**Mechanics (stolen wholesale from Supabase's generative OKLCH system — these are the fixes for "light mode looks odd"):**
- ONE hue family per mode (audit found light mode mixing four gray hue families at globals.css:29–46 — the root cause). Everything derives from hue 258.
- Canvas is **never pure white**: L=0.985 with a whisper of chroma.
- **Positive elevation step: higher = lighter in BOTH modes.** Cards sit near-white on the off-white canvas; the current bug (surface-200 ≡ card ≡ pure white, audit) is structurally impossible here because steps are ≥3% (audit: the 2% light ramp was imperceptible).
- **Borders are foreground-at-alpha, never gray literals** — they warm/cool with the theme automatically.
- Status colors darkened specifically for light mode ("a light amber on white disappears" — Supabase source comment).
- A dedicated **opaque** `--surface-inset` token replaces every `bg-background/40|60` translucent hack (audit: those composite to pure white in light mode and erase the IDE mock's structure).

**Token set (single source in `globals.css`, exactly like today):**

| Token | Light (OKLCH) | ≈ HSL | Dark (OKLCH) | ≈ HSL |
|---|---|---|---|---|
| `--background` | `oklch(0.985 0.003 258)` | `228 20% 98%` | `oklch(0.165 0.015 260)` | `233 28% 8%` |
| `--surface-sunken` (recessed band) | `oklch(0.962 0.005 258)` | `228 14% 95%` | `oklch(0.14 0.015 260)` | `233 30% 6%` |
| `--card` / raised | `oklch(0.998 0.001 258)` | `0 0% 100%` | `oklch(0.205 0.015 260)` | `233 22% 11%` |
| `--surface-inset` (opaque nested chrome) | `oklch(0.955 0.005 258)` | `228 12% 94%` | `oklch(0.145 0.015 260)` | `233 28% 6.5%` |
| `--popover` | `oklch(1 0 0)` | `0 0% 100%` | `oklch(0.235 0.015 260)` | `233 20% 13%` |
| `--foreground` | `oklch(0.22 0.02 260)` | `233 25% 12%` | `oklch(0.93 0.005 258)` | `228 12% 92%` |
| `--foreground-muted` | `oklch(0.45 0.015 260)` | `233 10% 40%` | `oklch(0.64 0.01 258)` | `228 8% 62%` |
| `--foreground-faint` | `oklch(0.58 0.012 260)` | `233 7% 54%` | `oklch(0.50 0.01 258)` | `228 6% 48%` |
| `--border` | fg @ 9% alpha | — | fg @ 10% alpha | — |
| `--border-strong` | fg @ 16% | — | fg @ 18% | — |
| `--primary` (trace) | `oklch(0.50 0.22 263)` | `230 78% 46%` | `oklch(0.70 0.17 262)` | `228 88% 68%` |
| `--primary-foreground` | `oklch(0.99 0 0)` | white | `oklch(0.14 0.02 260)` | ink |
| `--primary-wash` | primary @ 8% | — | primary @ 12% | — |
| `--success` | `oklch(0.55 0.14 155)` | `152 55% 36%` | `oklch(0.72 0.15 155)` | `152 55% 58%` |
| `--warning` | `oklch(0.62 0.13 80)` | `40 85% 42%` | `oklch(0.78 0.13 85)` | `45 85% 62%` |
| `--destructive` | `oklch(0.53 0.20 27)` | `12 75% 46%` | `oklch(0.66 0.19 25)` | `10 80% 62%` |

- **Contrast-brightening is mandatory** (Hyperbolic's 3-slot system): `--primary` is never one value across modes — dark mode lifts L 0.50→0.70. Same for all status colors.
- **Alpha border ladder** (together.ai): `--border-4/-8/-16` = fg at 4/8/16% for hairlines, card seams, table rules.
- **Chart palette** (equal L/C in OKLCH per mode, hues only): trace 262 · cyan 210 · violet 300 · amber 80 · green 155. Light: L 0.55 C 0.15; dark: L 0.72 C 0.15.
- Muted text pinned at L≈0.45 in light, never 0.55+ (Supabase's 68%-toward-foreground rule).
- **One canvas per page, hairline `border-t` seams between sections** — sections never change background color (Supabase's discipline; also fixes the audit finding that product/about stack three identical recessed bands because tone is baked inside shared components — tone becomes a page-owned prop, and only the hero-adjacent proof band + pre-footer may use `--surface-sunken`).
- Fix the last token violation while in there: privacy/terms amber banner → `--warning` tokens (audit: `app/privacy/page.tsx:31`).

---

## 4. TYPOGRAPHY

**Decision (lanes disagreed — audit said keep Satoshi, tech-stack lane said Geist; Geist wins):** Supabase itself quietly abandoned Circular for Inter+Manrope, so Satoshi-as-Circular-substitute now mimics something the reference dropped; Satoshi also loads render-blocking from Fontshare's CDN (audit) and its license is a leash. Geist is OFL, variable, self-hostable via `next/font` with zero third-party origins and CLS-safe fallback metrics, and its design brief is literally "technical + premium."

- **Sans (display + text): Geist Sans** — one variable file, used at 400 (body), 500 (headlines), 600 (UI emphasis). **No 700+ anywhere** (together.ai: weight-500 headlines are the premium tell; the audit found Satoshi 900 loaded and never used — that class of waste is banned).
- **Mono (machine voice): Geist Mono** — 400/500. Everything *measured* is mono: latency numbers, scores, state labels (`AWAIT_ANSWER → PROBE`), code, table numerics (`tabular-nums`), eyebrows. Prose is never mono.
- **Display accent: Departure Mono** (OFL pixel mono) as a tiny subset for the ASCII hero glyph layer and the 404 page ONLY, ≥22px at 11px multiples. Cut it if subsetting exceeds 12kB.
- **Scale:** display `clamp(2.75rem, 7vw, 6.5rem)` / lh 0.95 / -0.02em, weight 500. h2 `2.25rem` / 1.15 / -0.02em / 500. h3 `1.375rem` / 500. Body `1rem/1.6` 400 (15px floor — Geist's ClearType weakness). **Eyebrow — the signature atom** (together.ai's 79-instance tag): 11px Geist Mono uppercase, +0.06em, weight 500, in `--foreground-muted` with a `--primary` index prefix: `INT / 03 — SANDBOXED EXECUTION`.
- **Two-tone headings everywhere** (Supabase's highest-leverage free move): section titles set in `--foreground-muted` with only the payoff phrase in `--foreground` or `--primary`. Hierarchy via color and size, not weight.
- **Loading:** `next/font/local` (or the `geist` npm package), two woff2 variable files total, `display: swap`, preload the sans only; mono loads with the page. Kill both the Fontshare and Google Fonts round-trips (LCP is a font paint on our text-first hero, so this is the LCP fix).

---

## 5. MOTION LANGUAGE — "settle, don't float"

**Personality:** fast attack, decisive settle, zero ambient wobble. Motion behaves like a critically-damped system: it gets where it's going and stops.

**Easing tokens (the only three):**
- `--ease-out: cubic-bezier(.215,.61,.355,1)` — every hover/color/border/transform micro-transition (together.ai uses this ONE curve 20× sitewide; we do the same).
- **Entrances:** GSAP `expo.out` / `power4.out` only (Hyperbolic's rule — never ease-in-out on reveals; ease-in-out is the #1 template tell).
- **Progress/scrub:** `linear` (`ease:'none'`) — deterministic, clock-like. The linear progress bar is a brand statement (together.ai's story-tabs).

**Duration scale:** 120ms (micro/hover) · 200ms (UI state) · 350ms (panel/crossfade) · 600ms (section reveal) · 900ms (hero/logo draw, the ceiling). Tokens `--dur-1..5`; anything over 900ms needs a design review.

**Stack + when each is used:**
- **CSS** for all micro-interactions and anything in the authed app (dashboard/room stay CSS-only — they already have the 150/200/300ms + `cubic-bezier(0.16,1,0.3,1)` system in tailwind.config; keep it).
- **GSAP 3.13 + ScrollTrigger + SplitText** (all free post-Webflow acquisition) — marketing routes only, via `useGSAP({ scope })` in `'use client'` leaf components, class-selector targets, `contextSafe` handlers. ~50kB gz, deferred.
- **Declarative choreography:** one ~15-line client boundary that reads `data-animate='{"y":"20%"}'` JSON attributes from SSR markup and wires ScrollTriggers (Hyperbolic's `data-gsap` pattern) — no bespoke animation component per section.
- **Lenis** (~4kB): desktop-pointer only, driven from `gsap.ticker` with `autoRaf` off (frame-lock rule), never on touch, never when reduced-motion.
- **NumberFlow** (~7kB) for all counters (§6c). **three.js** only as the lazy hero/footer chunk (§6d, §8).
- **View transitions:** `next-view-transitions` (~2kB) — 180ms cross-fade on marketing navs + one shared element: `view-transition-name: fsm-diagram` so the homepage FSM graph morphs into the /how-it-works header (progressive enhancement; Firefox no-ops). Do NOT enable Next's `experimental.viewTransition` until the `unstable_` prefix drops.
- **Scroll choreography rules:** SplitText line-mask reveal on the hero h1 only, **server-pre-split** into `.line` spans so there's zero CLS (Hyperbolic's 8.2 WPO trick); one pinned ScrollTrigger section max per page (the FSM walkthrough); everything else is simple y/opacity reveals; all loops pause via IntersectionObserver off-screen (Supabase pauses everything).

**Reduced-motion story (single policy point):** one `capabilities()` util — `prefers-reduced-motion`, `saveData`, `deviceMemory>4`, WebGL support, `pointer:fine` — feeds Lenis instantiation, the WebGL gate, GSAP timeline durations (collapse to 0), and NumberFlow (built-in). Reduced-motion users get: static pre-split headline, static ASCII `<pre>` hero (same aesthetic — see §6a), instant tab switches, counters rendered at final value. Nothing is missing, nothing moves.

---

## 6. SIGNATURE COMPONENTS

### (a) The Hero — "The Ledger + The Field"
Three layers, value prop landed in 5 seconds:
1. **Headline (0–1s):** 2-col asymmetric layout (Supabase's hero skeleton): left, display-size two-tone h1 — `Infinite candidates.` in `--foreground-muted` / `Finite answers.` in `--foreground` with the terminal period in `--primary`; right column bottom-aligned subcopy: "An autonomous technical interviewer built as a finite-state machine. Deterministic. Sandboxed. Auditable." + two CTAs (Run an interview / Book a pilot). Server-pre-split lines, SplitText reveal 600ms expo.out, char stagger 0.012s.
2. **The FSM Transition Ledger (1–3s):** the live visual, pulled up under the headline with `-translate-y-16`, wrapped in the ProductFrame (§6f). A **real DOM table** that self-plays an interview — rows = turns (mono timestamps + state labels), the state cell flips `oral → probe → hint_offered → advance` with a `--primary/0.12` flash, a failing run row flashes `--destructive/0.15` then a hint row inserts with a 300ms layout animation. Specs copied verbatim from Supabase's VisualDemo: weighted action pick every 1.5–4s, 300ms layout ease `cubic-bezier(0.25,0.1,0.25,1)`, 150ms value swaps, 25ms intro row stagger, IO-paused off-screen, bottom fade via `mask-image`. Zero video, zero WebGL — it demos the FSM brain honestly and it's the light-mode-safe centerpiece.
3. **Ambient ASCII field (background, progressive):** a whisper-quiet FSM node field — faint nodes/edges in `--primary` at **1.5–8.5% alpha max** (Hyperbolic's restraint: reads as paper texture, not screensaver), scroll velocity piped in as a uniform so faster scrolling lights more transition paths. Ships as a custom fragment-shader ASCII pass (procedural 5×7 glyphs per cell, Codrops "Efecto" technique — never drei's DOM-table AsciiRenderer, whose color mode is documented "very expensive"). **The fallback IS the aesthetic:** a static `<pre>` of the same frame in Geist/Departure Mono costs ~0kB and is indistinguishable at rest — that's what mobile, reduced-motion, no-WebGL, and QA tooling see (this also permanently fixes the browser-QA black-frame problem in the project rules).
Below the hero, inside it (together.ai puts proof inside the hero): the **3-stat strip** — `~1s VOICE LATENCY · 97/97 HIDDEN TESTS · 0 SCORE VARIANCE` in mono, NumberFlow-rolled once. Hero gets a real stage: `min-h-[85svh]` (audit: current hero is ~60% of subpage header rhythm; a shared PageHero owns top spacing for all pages).

### (b) Live Product Showcase — DECISION: screen recordings, not DOM replay
Supabase's envied "dashboard with cursor movement" is theme-aware MP4s in a frame — that's the production answer and we take it. Record three polished captures **per theme** (dark + light, with poster PNGs): **Live interview** (AI probing after a failing run), **Code runs** (hidden-test grading, wrong 0/8 → reference 8/8), **Scoring report**. Tabbed inside ProductFrame; lazy-mount via a sentinel div 500px early; tab switch = 100ms opacity crossfade in / 50ms out; 4–5 checkmark highlight links under each tab. The live-DOM budget is spent once, on the hero ledger — recordings are cheaper to keep truthful as the product evolves. Cursor choreography is rehearsed in the recording, not engineered.

### (c) Animated Metric Counters
**NumberFlow everywhere** (Intl.NumberFormat + WAAPI, reduced-motion + screen-reader aware, ~7kB — beats GSAP textContent tweens which read as garbage to screen readers). Format = tilde-spec (Serve): mono, small-caps units, counts **once** on inView over ~800ms ease-out, then stable forever (settling motion). Surfaces: hero 3-stat strip; "vs market" bar section — Finite ~1s median turn latency vs generic-LLM interviewer ~8–20s vs human scheduling days, cost per screen vs engineer-hour equivalent, score reproducibility across reruns; include one *modest* number for credibility (together.ai ships 10% wins next to 2.75× wins — small numbers make big ones believable). Every number carries a source: "prod telemetry, June 2026." GSAP number tweens only where a value is scrubbed inside the pinned FSM section.

### (d) The Loop Moment — full-screen footer, not the hero
The Clipped Infinity band (Concept B) gets ONE 3D moment: the **full-screen pre-footer** (Hildén & Kaira's oversized-footer steal) — the band slowly rotating, rendered through the same ASCII fragment shader, camera drifting along its surface past mono station labels (`ask → listen → probe → score`) and arriving back at the cut end: the loop that terminates (Noomo's continuous camera path, miniaturized). Implementation: raw WebGL or minimal three (no drei; hand-roll controls), `next/dynamic ssr:false` inside a client shell, imported on `requestIdleCallback` only when capabilities pass, `frameloop`-on-demand, IO-paused. **Fallback:** static ASCII `<pre>` of the band + the terminal mono line with blink caret: `state: end — interview complete.` (Hyperbolic's footer flourish). If phase 5 slips, the fallback ships alone and the page is complete — the 3D is garnish by design.

### (e) Book-a-Demo — Cal.com
Element-click popup (`data-cal-link`) on nav + hero "Book a pilot" CTAs so **zero scheduler JS loads until intent** (critical path stays clean); full inline embed only on `/demo` for paid traffic. Themed via `getCalApi() → cal('ui', {...})` to `--primary` + dark mode. Footer footnote: "scheduling by open-source Cal.com" — on-brand for the auditable-vs-black-box pitch.

### (f) Section / Card / Border System — "reads expensive"
- **SectionContainer (one, enforced):** max-w 1280px, inline padding 24→48→96px, `py-16/24` (64–96px), sections stacked flush with `border-t` hairlines only (Supabase's exact numbers). Pricing tiers get wrapped in it (audit: the one block outside the rhythm).
- **ProductFrame (one, everywhere a screenshot/video appears):** 8px padding gutter in `--surface-inset`, three 8px dots in `--border` color (monochrome, theme-proof — never Mac red/yellow/green), inner border + radius, `aspect-video`. The single hero-grade instance adds Supabase's 6-layer stacked shadow (`0 149px 199px rgba(0,0,0,.07) … 0 4px 5.5px .02`) + 0.5px ring. Current BrowserFrame upgrades into this.
- **Cards:** p-px gradient-border trick (outer `bg-linear-to-b from-border to-border/50`, inner `--card`) with the **cursor shimmer painted on the 1px seam layer** (`radial-gradient(30rem circle at x y, var(--border-strong), transparent)`) — light lives in the border, never a glow blob over content; hover swaps the seam to `--primary`; Safari gets the static fallback (Supabase's exact recipe). One FeatureGrid component replaces the three near-identical icon-card grids (audit: usp-pillars/how-it-works/security are the same card thrice).
- **Framed logo rail:** `border-y` + inner `border-x` hairlines framing monochrome logos at 0.7 opacity (languages/providers until customers exist), blur-in stagger if >12 items.
- **Visible grid:** faded 1px column hairlines (`linear-gradient(transparent, border 15% 85%, transparent)`) in hero and proof sections — the exposed grid IS the determinism value prop (Hyperbolic).
- **Radius:** keep the existing sharp + 6px-input scale (validated by together.ai's 4–8px dominance). **One animated exception sitewide:** the recommended pricing tier's 2px gradient hairline, 20s linear (Hyperbolic).
- **Nav:** transparent + `backdrop-blur-xs` + `border-b` hairline, h-16, no bg fill either theme (Supabase's one-canvas rule); replaces the floating pill-nav. Nav taxonomy: **Product / How it works / Problems / Pricing / Docs**, every item with a muted one-line descriptor (together.ai's cheapest premium signal); Problems dropdown lists 5 live problem names from bank.json (the catalog is marketing).

---

## 7. PER-PAGE PLAN

**Landing (order fixed — proof-first, fixes the audit's "17 cards before the first product visual"):**
1. Announcement bar (one line, changelog: "gVisor sandbox live · sub-second voice")
2. Nav
3. **Hero** (§6a: headline + FSM ledger + ASCII field + 3-stat strip) — min-h 85svh
4. **Anatomy of an Interview** — auto-advancing tabs = FSM states (`consent → oral → coding → probe → score`), linear progress bar per tab (together.ai story-bars, 8s, IO-paused), panel shows that state's real UI; a persistent mini-graph lights each node as tabs advance (NRG's phase-walk). Absorbs HowItWorks + EditorShowcase.
5. **Bento** (kept, re-tokened, cursor-seam cards) — flagship 2×-width card = the interview room with checkmark highlights; one card gets the interviewer-presence treatment (Supabase RealtimeVisual: AI cursor drifts inversely to yours, typing dots animate on hover only, readability gradient overlay).
6. **Showcase tabs** (§6b recordings)
7. **The Audit Artifact** — server-Shiki code block of a real FSM transition JSON, line numbers, custom theme with `--primary` on the most common token type, money line as a comment: `// same candidate, same answers → same score, every run`; floating "Docs" pill inside the block (Supabase ApiSection).
8. **Proof band** (`--surface-sunken`) — NumberFlow bar charts vs named alternatives + one modest number (§6c)
9. **Language rail** (framed, single LANGUAGES constant in `lib/site.ts` mirroring bank.json — audit found 6 vs "Six" vs 8 contradictions)
10. **Security/trust** — gVisor, hidden-test isolation, proctoring; defensible claims only (drop "SOC 2 Type II" until certified — audit flags it as aspirational)
11. **Loop footer moment** (§6d) → **py-32 closing CTA** restating the hero with emphasis inverted (`Infinite candidates.` now full-foreground) — Supabase's bookend.

**Product:** PageHero + numbered module index (Sui): `01 FSM CORE · 02 VOICE PIPELINE · 03 SANDBOX (gVisor) · 04 SCORER · 05 PROCTOR · 06 TELEMETRY`, each a FeatureGrid section with an eyebrow, alternating base/sunken tones **assigned by the page, not the component** (audit's structural fix).

**How-it-works — the authentic tech showcase:** the pinned ScrollTrigger FSM diagram (shared view-transition element from the landing) walked state by state; real numbers with sources (~1s median turn, STT/oracle/TTS breakdown from the voice.turn ledger, 23s→1s story); the sandbox story (gVisor kernel string `4.19.0-gvisor` as a mono artifact, attack-battery results); the hidden-test grading flow (wrong 0/8 vs reference 8/8); the transition-log spec published as our FlashAttention-equivalent artifact (together.ai: research as proof layer → for us, the FSM spec IS the research). Add the TL;DR modal (digitalists) for time-poor hiring managers.

**Pricing:** real per-interview unit table — columns `oral-only | +coding | +voice | +proctoring`, volume ladder as columns (`1–50 / 51–500 / 501–5k / Enterprise` — together.ai's GPU reservation table), engineer-hour-equivalent shown inline in the same cell (their cached-discount analog), contact-sales ONLY in the enterprise column, disclaimers under the table. Never "from $X." NumberFlow cost calculator re-rolls as the volume slider moves. Recommended tier gets the one animated hairline.

**Auth:** re-token only; keep OAuth brand hexes (correct as brand marks). Wordmark + one mono line: `state: authenticating`.

**Dashboard:** logic untouched; inherits Blueline via tokens. Keep the sticky blurred header + breadcrumbs (audit: already the quality bar). Candidate-card → detail nav gets the shared-element zoom (Hubtown) via view-transition-name — the one authed-app flourish.

**Admin analytics (big-number redesign):** lead with a single 4-stat row of MetricCards with a new `size="lg"` variant — `text-5xl tabular-nums` Geist Mono; money rounded to whole cents at summary tier, `dp=4` survives only inside the per-model table (audit: today's $0.0374 hero numbers are the problem, not the recharts). Keep the provider head-to-head + model table as-is below. Recruiter analytics (score distributions, funnel) = separate future view on the same MetricCard/Panel atoms, out of scope here.

**Interview room:** re-tokens only via CSS vars, zero component changes (hard constraint). The one addition: state label chip in the room header (`state: probing`) — free, on-brand, and it's the product being honest.

---

## 8. PERFORMANCE BUDGET (CI-enforced via size-limit per route)

| Metric | Budget |
|---|---|
| Marketing LCP | ≤ 1.5s (LCP = hero h1 font paint — text-first hero guarantees it) |
| Marketing first-load JS | ≤ 120kB gz (framework + fonts CSS; no motion libs in first load) |
| Motion layer (GSAP+ST+SplitText+Lenis+NumberFlow) | ≤ 65kB gz, loaded deferred/idle |
| WebGL chunks (hero field, footer band) | ≤ 280kB gz combined, post-LCP, capability-gated, desktop only |
| Third-party JS on critical path | 0 (Cal on click, analytics deferred, fonts self-hosted) |
| Fonts | 2 woff2 variable files, swap + adjusted fallbacks, CLS 0 |
| CLS | < 0.02 (pre-split headline spans, poster-sized media slots) |

**The "instant" checklist:** every below-fold section `dynamic()`-imported; every loop (ledger, tabs, videos, shaders) IO-paused not just lazy-mounted; showcase videos mount via the -500px sentinel with AVIF posters; Shiki server-side (zero client highlight JS); Link prefetch-on-viewport + fully static marketing routes; no spinner anywhere — the logo draw is the only loading state; room pre-warmed during consent so Start is a sub-100ms transition (latency theater = brand). Three.js isolation: never imported at module top level of any route; lives behind `next/dynamic ssr:false` in client shells, gated by the single `capabilities()` util; if kept out entirely until phase 5, delete `three` + `@types/three` + orphaned `dotted-surface.tsx` per the remove-slop directive and re-add fresh.

---

## 9. IMPLEMENTATION PHASES (each independently shippable)

**What survives (explicit):** all 13 `components/ds/` atoms; dashboard + interview room logic and markup (re-token only); BrowserFrame (→ProductFrame), Bento shell, SectionDivider, Reveal's delay-prop API; tailwind.config radius/duration/easing plumbing; the token-driven single-source architecture itself. **What dies:** Satoshi/Fontshare + Google Fonts round-trips, CRA favicons, pill-nav, StartInSeconds on landing (moves to how-it-works), the three duplicate icon grids, ember tokens, `three` dep until phase 5, `react-intersection-observer` (zero importers), about-page TODO blocks, "SOC 2 Type II" claim.

1. **P0 — Blueline tokens + identity hygiene (1–2 days).** Rewrite `:root`/`.dark` in globals.css (one hue family, elevation steps, alpha borders, `--surface-inset`, contrast-brightened primary); swap `bg-background/40|60` call sites to `--surface-inset`; fix the amber banner; ship favicon.ico/icon.svg/apple-icon; Geist via next/font; wordmark "finite." Site is fully re-branded and light mode is fixed before any layout work. *Ships alone: yes — everything downstream is token-fed, including the room.*
2. **P1 — Structure (1–2 days).** SectionContainer everywhere + border-t seams + tone-as-page-prop; transparent nav + descriptors; PageHero with unified proportions; FeatureGrid consolidation; footer columns + terminal line; content hygiene (TODOs, claims, LANGUAGES constant).
3. **P2 — Hero (2–3 days).** SSR pre-split two-tone headline; the FSM Transition Ledger DOM demo; 3-stat NumberFlow strip; ProductFrame + 6-layer shadow; static ASCII `<pre>` background (the fallback ships first — WebGL comes in P5).
4. **P3 — Motion layer + Anatomy section (2–3 days).** GSAP/ScrollTrigger/SplitText via useGSAP + the data-animate reader; Lenis behind capabilities(); auto-advancing state tabs with linear bars + mini-graph; next-view-transitions cross-fade + FSM shared element; cursor-seam cards.
5. **P4 — Proof + pages (2–3 days).** Theme-paired showcase recordings; Shiki audit-artifact block; vs-market charts; pricing table + calculator; how-it-works pinned walkthrough; Cal.com popup + /demo.
6. **P5 — The WebGL moments (2–4 days, gated on P0–P4 shipped).** ASCII fragment-shader hero field with scroll-velocity uniform; Clipped Infinity footer band; logo draw as loader. Explicitly droppable — the site is complete without it.
7. **P6 — Authed surfaces (1 day).** MetricCard `size="lg"` + analytics 4-stat row + whole-cent rounding; room state chip; dashboard zoom transition. QA both themes via browser-use per project rules.

Total: ~10–15 focused days; P0+P1 alone deliver the visible rebrand.

---

## 10. RISKS + BANNED SLOP

**Risks (with mitigations):**
- *Ultramarine drifts into generic-SaaS-blue* → enforce the <5%-of-pixels rationing, no blue gradients/washes ever, mono ledger layer carries the distinctiveness; if it still reads generic after P2, the escape hatch is shifting hue 262→275 (violet-ultramarine), a token-only change.
- *WebGL scope creep* → P5 is last, droppable, fallback-first; the `<pre>` ASCII must ship in P2 and look finished.
- *Recording maintenance* (showcase MP4s go stale as product evolves) → accepted; recordings live in a documented re-capture script; posters regenerate from frame 0.
- *Light-mode regressions* → every phase QA'd in BOTH themes via browser-use (project hard rule); the generative token mechanics make the two modes provably symmetric rather than hand-tuned twice.
- *Lenis jank on mixed input / sticky breakage* → desktop-pointer only, gsap.ticker-driven, never `overflow-x:hidden` on html/body.
- *Rebrand naming vs product* → domain/OG/emails out of scope here; the token system is name-agnostic (Blueline works whatever the final legal mark is).

**Banned — the AI-slop tells (lint-able where possible):**
1. Gradient blob heroes and purple→pink gradients. 2. Glassmorphism cards. 3. Emoji anywhere in UI copy. 4. 700+ weight headlines. 5. `ease-in-out` on any reveal. 6. Infinite pulse/float/breathe animations (the settling rule). 7. Mixed corner radii. 8. Gray-literal borders (`#e5e7eb`) — alpha tokens only. 9. "from $X" pricing, unattributed quotes, quotes without a metric. 10. Sparkle/✨/robot iconography and "AI-powered/magic/supercharge" copy — engineering nouns only. 11. `hover:scale-105` on everything. 12. Spinners. 13. Stock 3D/illustration — the only imagery is the product, the ledger, and the band. 14. Default-shadcn look: no untouched shadcn compositions on marketing routes; atoms come from `components/ds/`. 15. Numbers without units and sources. 16. Dark-only design decisions — light is first-class; every new component is reviewed light-first.

The one-line brief for every future contributor: **every surface is a spec sheet, every number has a source, and everything that moves comes to rest.**
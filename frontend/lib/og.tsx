import { ImageResponse } from 'next/og';

/* Shared OG-image renderer — the brand card every pasted link shows (1200×630). Ink night canvas,
 * the page grid rules, the clipped-loop mark, a two-tone display headline with the accent period,
 * and the mono proof strip. Fonts are vendored TTFs (satori can't read woff2). */

export const OG_SIZE = { width: 1200, height: 630 };

const INK = '#0d1120'; // the favicon chip — brand night
const PAPER = '#e8eaf0';
const SUBTLE = '#8b91a3';
const GHOST = '#565c6e';
const TRACE = '#3d6aff';
const GREEN = '#4fce9b';
const RULE = 'rgba(139,145,163,0.16)';

async function loadFonts() {
  const [sans, mono] = await Promise.all([
    fetch(new URL('../assets/og/satoshi-500.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('../assets/og/sourcecodepro-500.ttf', import.meta.url)).then((r) =>
      r.arrayBuffer()
    ),
  ]);
  return [
    { name: 'Satoshi', data: sans, weight: 500 as const, style: 'normal' as const },
    { name: 'SourceCodePro', data: mono, weight: 500 as const, style: 'normal' as const },
  ];
}

export async function ogImage({
  eyebrow,
  line1,
  line2,
  sub,
}: {
  eyebrow: string;
  line1: string;
  line2: string;
  sub: string;
}) {
  const fonts = await loadFonts();
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: INK,
        padding: '56px 72px',
        fontFamily: 'Satoshi',
        position: 'relative',
      }}
    >
      {/* Page grid rules */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 48,
          width: 1,
          backgroundColor: RULE,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 48,
          width: 1,
          backgroundColor: RULE,
        }}
      />
      {/* Trace glow, top */}
      <div
        style={{
          position: 'absolute',
          top: -220,
          left: 300,
          width: 600,
          height: 360,
          background: 'radial-gradient(closest-side, rgba(61,106,255,0.22), rgba(61,106,255,0))',
        }}
      />

      {/* Header row: mark + wordmark, eyebrow right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
            <path
              d="M 12 12 C 9.6 8.4 4.2 8.4 4.2 12 C 4.2 15.6 9.6 15.6 12 12 C 13.8 9.3 16.8 8.1 18.6 9.3"
              stroke={PAPER}
              strokeWidth="2.1"
              strokeLinecap="round"
            />
            <circle cx="19.9" cy="10.6" r="1.9" fill={TRACE} />
          </svg>
          <div style={{ display: 'flex', fontSize: 34, color: PAPER }}>
            finite<span style={{ color: TRACE }}>.</span>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            fontFamily: 'SourceCodePro',
            fontSize: 19,
            letterSpacing: 3,
            color: SUBTLE,
            textTransform: 'uppercase',
          }}
        >
          {eyebrow}
        </div>
      </div>

      {/* Headline */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontSize: 84,
            lineHeight: 1.04,
            color: SUBTLE,
            letterSpacing: -2,
          }}
        >
          {line1}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 84,
            lineHeight: 1.04,
            color: PAPER,
            letterSpacing: -2,
          }}
        >
          {line2}
          <span style={{ color: TRACE }}>.</span>
        </div>
        <div style={{ display: 'flex', marginTop: 26, fontSize: 27, color: SUBTLE, maxWidth: 860 }}>
          {sub}
        </div>
      </div>

      {/* Mono proof strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 34,
          fontFamily: 'SourceCodePro',
          fontSize: 21,
          color: GHOST,
          borderTop: `1px solid ${RULE}`,
          paddingTop: 26,
        }}
      >
        <span style={{ display: 'flex', color: GREEN }}>~1s spoken response</span>
        <span style={{ display: 'flex' }}>·</span>
        <span style={{ display: 'flex', color: SUBTLE }}>deterministic scoring</span>
        <span style={{ display: 'flex' }}>·</span>
        <span style={{ display: 'flex', color: SUBTLE }}>gVisor sandbox</span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginLeft: 'auto',
            color: GHOST,
          }}
        >
          state: end
          <span
            style={{ display: 'flex', width: 10, height: 22, backgroundColor: TRACE, opacity: 0.7 }}
          />
        </span>
      </div>
    </div>,
    { ...OG_SIZE, fonts }
  );
}

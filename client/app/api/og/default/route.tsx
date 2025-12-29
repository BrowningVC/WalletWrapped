import { ImageResponse } from '@vercel/og';

export const runtime = 'edge';

// Cache fonts
let cachedInterBold: ArrayBuffer | null = null;

async function getFont(font: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const API = `https://fonts.googleapis.com/css2?family=${font}:wght@${weight}&display=swap`;
    const css = await (
      await fetch(API, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1',
        },
      })
    ).text();
    const resource = css.match(/src: url\((.+)\) format\('(opentype|truetype)'\)/);
    if (!resource) return null;
    const response = await fetch(resource[1]);
    return response.arrayBuffer();
  } catch {
    return null;
  }
}

export async function GET() {
  // Load font if not cached
  if (!cachedInterBold) {
    cachedInterBold = await getFont('Inter', 700);
  }

  const width = 1200;
  const height = 630;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #0c0c1d 0%, #151528 50%, #0a0a18 100%)',
          fontFamily: 'Inter',
          position: 'relative',
        }}
      >
        {/* Gradient orbs */}
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            right: '-100px',
            width: '500px',
            height: '500px',
            background: 'radial-gradient(circle, rgba(255,215,0,0.15) 0%, transparent 70%)',
            borderRadius: '50%',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-150px',
            left: '-150px',
            width: '600px',
            height: '600px',
            background: 'radial-gradient(circle, rgba(168,85,247,0.12) 0%, transparent 70%)',
            borderRadius: '50%',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '800px',
            height: '800px',
            background: 'radial-gradient(circle, rgba(255,107,157,0.08) 0%, transparent 70%)',
            borderRadius: '50%',
            display: 'flex',
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            zIndex: 10,
          }}
        >
          {/* Logo text */}
          <div
            style={{
              fontSize: '80px',
              fontWeight: '700',
              color: 'white',
              letterSpacing: '-0.02em',
              display: 'flex',
            }}
          >
            WalletWrapped
          </div>

          {/* Tagline with gradient */}
          <div
            style={{
              fontSize: '42px',
              fontWeight: '700',
              background: 'linear-gradient(90deg, #ffd700 0%, #ff6b9d 50%, #9d4edd 100%)',
              backgroundClip: 'text',
              color: 'transparent',
              display: 'flex',
            }}
          >
            Your 2025 Trading Year in Review
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: '28px',
              color: '#9ca3af',
              marginTop: '16px',
              display: 'flex',
            }}
          >
            Analyze any Solana wallet • Free • No login required
          </div>

          {/* Feature badges */}
          <div
            style={{
              display: 'flex',
              gap: '32px',
              marginTop: '32px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                background: 'rgba(34, 197, 94, 0.1)',
                border: '2px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '12px',
              }}
            >
              <div style={{ fontSize: '24px', display: 'flex' }}>📈</div>
              <div style={{ fontSize: '20px', color: '#22c55e', fontWeight: '600', display: 'flex' }}>P&L Analytics</div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                background: 'rgba(168, 85, 247, 0.1)',
                border: '2px solid rgba(168, 85, 247, 0.3)',
                borderRadius: '12px',
              }}
            >
              <div style={{ fontSize: '24px', display: 'flex' }}>🎆</div>
              <div style={{ fontSize: '20px', color: '#a855f7', fontWeight: '600', display: 'flex' }}>Shareable Cards</div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                background: 'rgba(255, 215, 0, 0.1)',
                border: '2px solid rgba(255, 215, 0, 0.3)',
                borderRadius: '12px',
              }}
            >
              <div style={{ fontSize: '24px', display: 'flex' }}>⚡</div>
              <div style={{ fontSize: '20px', color: '#ffd700', fontWeight: '600', display: 'flex' }}>15s Analysis</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span style={{ fontSize: '18px', color: '#6b7280', display: 'flex' }}>powered by</span>
          <span
            style={{
              fontSize: '28px',
              fontWeight: 'bold',
              background: 'linear-gradient(90deg, #ffd700 0%, #ff6b9d 50%, #9d4edd 100%)',
              backgroundClip: 'text',
              color: 'transparent',
              display: 'flex',
            }}
          >
            $WRAPPED
          </span>
        </div>
      </div>
    ),
    {
      width,
      height,
      fonts: cachedInterBold
        ? [{ name: 'Inter', data: cachedInterBold, weight: 700, style: 'normal' as const }]
        : [],
    }
  );
}

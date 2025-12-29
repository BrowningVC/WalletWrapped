import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// Cache fonts at module level
let cachedInterFont: ArrayBuffer | null = null;
let cachedInterBold: ArrayBuffer | null = null;
let fontLoadPromise: Promise<void> | null = null;

// Cache highlights data with TTL
const highlightsCache = new Map<string, { data: any; timestamp: number }>();
const HIGHLIGHTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for OG images

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

async function loadFonts() {
  if (cachedInterFont && cachedInterBold) return;
  if (fontLoadPromise) {
    await fontLoadPromise;
    return;
  }
  fontLoadPromise = (async () => {
    const [font, bold] = await Promise.all([
      getFont('Inter', 400),
      getFont('Inter', 700),
    ]);
    cachedInterFont = font;
    cachedInterBold = bold;
  })();
  await fontLoadPromise;
}

async function getHighlights(address: string, apiUrl: string): Promise<any[] | null> {
  const now = Date.now();
  const cached = highlightsCache.get(address);
  if (cached && (now - cached.timestamp) < HIGHLIGHTS_CACHE_TTL) {
    return cached.data;
  }

  // Clean expired entries
  if (highlightsCache.size > 100) {
    for (const [key, value] of highlightsCache.entries()) {
      if (now - value.timestamp > HIGHLIGHTS_CACHE_TTL) {
        highlightsCache.delete(key);
      }
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${apiUrl}/api/wallet/${address}/highlights`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    highlightsCache.set(address, { data, timestamp: now });
    return data;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  // OG image dimensions (Twitter summary_large_image: 1200x630)
  const width = 1200;
  const height = 630;

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

    const [, highlights] = await Promise.all([
      loadFonts(),
      getHighlights(address, apiUrl),
    ]);

    // If no highlights found, show "analyze your wallet" CTA
    if (!highlights || highlights.length === 0) {
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
            }}
          >
            {/* Gradient orbs */}
            <div
              style={{
                position: 'absolute',
                top: '-100px',
                right: '-100px',
                width: '400px',
                height: '400px',
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
                width: '500px',
                height: '500px',
                background: 'radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%)',
                borderRadius: '50%',
                display: 'flex',
              }}
            />

            {/* Logo and title */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '24px',
              }}
            >
              <div
                style={{
                  fontSize: '72px',
                  fontWeight: '700',
                  color: 'white',
                  display: 'flex',
                }}
              >
                WalletWrapped
              </div>
              <div
                style={{
                  fontSize: '36px',
                  background: 'linear-gradient(90deg, #ffd700 0%, #ff6b9d 50%, #9d4edd 100%)',
                  backgroundClip: 'text',
                  color: 'transparent',
                  display: 'flex',
                }}
              >
                Your 2025 Trading Year in Review
              </div>
              <div
                style={{
                  fontSize: '24px',
                  color: '#9ca3af',
                  marginTop: '16px',
                  display: 'flex',
                }}
              >
                Analyze any Solana wallet • Free • No login required
              </div>
            </div>
          </div>
        ),
        {
          width,
          height,
          fonts: [
            cachedInterFont && { name: 'Inter', data: cachedInterFont, weight: 400, style: 'normal' as const },
            cachedInterBold && { name: 'Inter', data: cachedInterBold, weight: 700, style: 'normal' as const },
          ].filter(Boolean) as any[],
        }
      );
    }

    // Get key highlights for display
    const overallPnl = highlights.find((h: any) => h.type === 'overall_pnl');
    const biggestWin = highlights.find((h: any) => h.type === 'biggest_win');
    const winRate = highlights.find((h: any) => h.type === 'win_rate');

    const isProfit = overallPnl?.metadata?.isProfit !== false;
    const mainColor = isProfit ? '#22c55e' : '#ef4444';

    // Format P&L value (remove decimals for cleaner display)
    let pnlValue = overallPnl?.valuePrimary || '$0';
    if (typeof pnlValue === 'string' && pnlValue.includes('$')) {
      pnlValue = pnlValue.replace(/(\$[\d,]+)\.\d+/, '$1');
    }

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            background: 'linear-gradient(145deg, #0c0c1d 0%, #151528 50%, #0a0a18 100%)',
            fontFamily: 'Inter',
            padding: '48px',
          }}
        >
          {/* Gradient orbs */}
          <div
            style={{
              position: 'absolute',
              top: '-80px',
              right: '-80px',
              width: '350px',
              height: '350px',
              background: `radial-gradient(circle, ${mainColor}20 0%, transparent 70%)`,
              borderRadius: '50%',
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '-120px',
              left: '-120px',
              width: '400px',
              height: '400px',
              background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)',
              borderRadius: '50%',
              display: 'flex',
            }}
          />

          {/* Main content container */}
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              border: '3px solid rgba(139, 92, 246, 0.3)',
              borderRadius: '24px',
              padding: '40px',
              background: 'rgba(15, 15, 30, 0.5)',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '32px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '42px',
                      fontWeight: '700',
                      color: 'white',
                      display: 'flex',
                    }}
                  >
                    2025 Wrapped
                  </div>
                  {/* Firework emoji */}
                  <div style={{ fontSize: '36px', display: 'flex' }}>🎆</div>
                </div>
                <div
                  style={{
                    fontSize: '20px',
                    color: '#9ca3af',
                    fontFamily: 'monospace',
                    display: 'flex',
                  }}
                >
                  {address.slice(0, 8)}...{address.slice(-8)}
                </div>
              </div>
              <div
                style={{
                  fontSize: '18px',
                  color: '#a855f7',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  display: 'flex',
                }}
              >
                Year in Review
              </div>
            </div>

            {/* Main P&L display */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                gap: '16px',
              }}
            >
              <div
                style={{
                  fontSize: '24px',
                  color: '#9ca3af',
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                  display: 'flex',
                }}
              >
                Total P&L
              </div>
              <div
                style={{
                  fontSize: '96px',
                  fontWeight: '700',
                  color: mainColor,
                  textShadow: `0 0 60px ${mainColor}50`,
                  letterSpacing: '-0.02em',
                  display: 'flex',
                }}
              >
                {pnlValue}
              </div>
              {overallPnl?.valueSecondary && (
                <div
                  style={{
                    fontSize: '28px',
                    color: '#6b7280',
                    display: 'flex',
                  }}
                >
                  {overallPnl.valueSecondary} SOL
                </div>
              )}

              {/* Secondary stats row */}
              <div
                style={{
                  display: 'flex',
                  gap: '64px',
                  marginTop: '24px',
                }}
              >
                {biggestWin && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <div style={{ fontSize: '16px', color: '#6b7280', textTransform: 'uppercase', display: 'flex' }}>Best Trade</div>
                    <div style={{ fontSize: '32px', fontWeight: '700', color: '#22c55e', display: 'flex' }}>
                      {typeof biggestWin.valuePrimary === 'string'
                        ? biggestWin.valuePrimary.replace(/(\$[\d,]+)\.\d+/, '$1')
                        : biggestWin.valuePrimary}
                    </div>
                    {biggestWin.metadata?.tokenSymbol && (
                      <div style={{ fontSize: '14px', color: '#9ca3af', display: 'flex' }}>
                        ${biggestWin.metadata.tokenSymbol}
                      </div>
                    )}
                  </div>
                )}
                {winRate && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <div style={{ fontSize: '16px', color: '#6b7280', textTransform: 'uppercase', display: 'flex' }}>Win Rate</div>
                    <div style={{ fontSize: '32px', fontWeight: '700', color: '#a855f7', display: 'flex' }}>
                      {winRate.valuePrimary}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                paddingTop: '24px',
                borderTop: '1px solid rgba(139, 92, 246, 0.2)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <span style={{ fontSize: '16px', color: '#6b7280', display: 'flex' }}>powered by</span>
                <span
                  style={{
                    fontSize: '24px',
                    fontWeight: 'bold',
                    background: 'linear-gradient(90deg, #ffd700 0%, #ff6b9d 50%, #9d4edd 100%)',
                    backgroundClip: 'text',
                    color: 'transparent',
                    display: 'flex',
                  }}
                >
                  $WRAPPED
                </span>
                <span style={{ fontSize: '18px', color: '#9ca3af', marginLeft: '8px', display: 'flex' }}>
                  walletwrapped.io
                </span>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width,
        height,
        fonts: [
          cachedInterFont && { name: 'Inter', data: cachedInterFont, weight: 400, style: 'normal' as const },
          cachedInterBold && { name: 'Inter', data: cachedInterBold, weight: 700, style: 'normal' as const },
        ].filter(Boolean) as any[],
      }
    );
  } catch (error) {
    console.error('[OG Image] Error generating image:', error);

    // Fallback error image
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
          }}
        >
          <div style={{ fontSize: '64px', fontWeight: '700', color: 'white', display: 'flex' }}>
            WalletWrapped
          </div>
          <div
            style={{
              fontSize: '32px',
              background: 'linear-gradient(90deg, #ffd700 0%, #ff6b9d 50%, #9d4edd 100%)',
              backgroundClip: 'text',
              color: 'transparent',
              marginTop: '16px',
              display: 'flex',
            }}
          >
            Your 2025 Solana Trading Wrapped
          </div>
        </div>
      ),
      { width, height }
    );
  }
}

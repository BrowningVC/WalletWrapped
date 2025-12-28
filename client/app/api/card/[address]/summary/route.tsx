import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// Cache fonts at module level
let cachedInterFont: ArrayBuffer | null = null;
let cachedInterBold: ArrayBuffer | null = null;
let fontLoadPromise: Promise<void> | null = null;

// Cache highlights data
const highlightsCache = new Map<string, { data: any; timestamp: number }>();
const HIGHLIGHTS_CACHE_TTL = 60 * 1000;

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

// Proactively clean expired entries from cache
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of highlightsCache.entries()) {
    if (now - value.timestamp > HIGHLIGHTS_CACHE_TTL) {
      highlightsCache.delete(key);
    }
  }
}

async function getHighlights(address: string, apiUrl: string): Promise<any[]> {
  const now = Date.now();
  const cached = highlightsCache.get(address);
  if (cached && (now - cached.timestamp) < HIGHLIGHTS_CACHE_TTL) {
    return cached.data;
  }

  // Clean expired entries before adding new one
  if (highlightsCache.size > 25) {
    cleanExpiredCache();
  }

  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/wallet/${address}/highlights`, {
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Request timeout: highlights API took too long');
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`Failed to fetch highlights: ${response.status}`);
  }
  const data = await response.json();

  // Reorder highlights: move overall_pnl to the end (6th position) to match client UI
  const reorderedData = [
    ...data.filter((h: any) => h.type !== 'overall_pnl'),
    ...data.filter((h: any) => h.type === 'overall_pnl'),
  ];

  highlightsCache.set(address, { data: reorderedData, timestamp: now });

  // Hard limit: remove oldest if still over 50 entries
  if (highlightsCache.size > 50) {
    const oldestKey = highlightsCache.keys().next().value;
    if (oldestKey) highlightsCache.delete(oldestKey);
  }
  return reorderedData;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

    // Try to get pre-generated summary card from server cache first (instant!)
    try {
      const cacheResponse = await fetch(`${apiUrl}/api/wallet/${address}/card/summary`, {
        cache: 'no-store',
      });

      if (cacheResponse.ok) {
        // Return cached image directly
        const imageBuffer = await cacheResponse.arrayBuffer();
        return new Response(imageBuffer, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }
      // Cache miss (404) - fall through to generate
    } catch {
      // Server cache unavailable - fall through to generate
    }

    // Cache miss - generate the card
    const [, highlights] = await Promise.all([
      loadFonts(),
      getHighlights(address, apiUrl),
    ]);

    // Generate at 2x resolution
    const scale = 2;
    const width = 400 * scale;
    const height = 500 * scale; // Slightly shorter for tighter layout
    const s = (v: number) => v * scale;

    // Determine overall color based on total P&L
    const overallPnl = highlights.find((h: any) => h.type === 'overall_pnl');
    const isProfit = overallPnl?.metadata?.isProfit !== false;
    const mainColor = isProfit ? '#22c55e' : '#ef4444';

    const imageResponse = new ImageResponse(
      (
        <div
          style={{
            width: `${width}px`,
            height: `${height}px`,
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(145deg, #0c0c1d 0%, #151528 50%, #0a0a18 100%)',
            position: 'relative',
            fontFamily: 'Inter',
            overflow: 'hidden',
            padding: `${s(20)}px`,
          }}
        >
          {/* Subtle gradient orb */}
          <div
            style={{
              position: 'absolute',
              top: `${s(-60)}px`,
              right: `${s(-60)}px`,
              width: `${s(180)}px`,
              height: `${s(180)}px`,
              background: `radial-gradient(circle, ${mainColor}15 0%, transparent 70%)`,
              borderRadius: '50%',
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: `${s(-80)}px`,
              left: `${s(-80)}px`,
              width: `${s(200)}px`,
              height: `${s(200)}px`,
              background: 'radial-gradient(circle, #a855f710 0%, transparent 70%)',
              borderRadius: '50%',
              display: 'flex',
            }}
          />

          {/* Main container with border */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              border: `${s(1.5)}px solid rgba(139, 92, 246, 0.3)`,
              borderRadius: `${s(14)}px`,
              padding: `${s(18)}px`,
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(15, 15, 30, 0.4)',
            }}
          >
            {/* Header - compact */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: `${s(14)}px`,
                paddingBottom: `${s(12)}px`,
                borderBottom: `${s(1)}px solid rgba(139, 92, 246, 0.2)`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${s(6)}px`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      fontSize: `${s(20)}px`,
                      fontWeight: '700',
                      color: 'white',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    2025 Wrapped
                  </div>
                  {/* Firework icon with gold/pink/purple gradient */}
                  <svg
                    width={s(16)}
                    height={s(16)}
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{ display: 'flex', flexShrink: 0 }}
                  >
                    <defs>
                      <linearGradient id="fireworkGradientSummary" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#ffd700" />
                        <stop offset="50%" stopColor="#ff6b9d" />
                        <stop offset="100%" stopColor="#9d4edd" />
                      </linearGradient>
                    </defs>
                    <circle cx="12" cy="12" r="2" fill="#ffd700" />
                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="url(#fireworkGradientSummary)" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: `${s(9)}px`,
                    color: '#9ca3af',
                    fontFamily: 'monospace',
                    marginTop: `${s(2)}px`,
                  }}
                >
                  {address.slice(0, 6)}...{address.slice(-6)}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: `${s(11)}px`,
                  color: '#a855f7',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                Year in Review
              </div>
            </div>

            {/* Highlights List - tight vertical layout */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: `${s(6)}px`,
                flex: 1,
              }}
            >
              {highlights.map((h: any, idx: number) => {
                let value = h.metadata?.formattedPrimary || h.valuePrimary;
                const subtitle = h.metadata?.formattedSecondary || h.valueSecondary;
                const tokenSymbol = h.metadata?.tokenSymbol;

                // Remove decimal points from dollar values for cleaner display
                if (typeof value === 'string' && value.includes('$')) {
                  // Remove decimals: "-$397,648.8" -> "-$397,648"
                  value = value.replace(/(\$[\d,]+)\.\d+/, '$1');
                }

                // Determine color based on type and value
                // Biggest win, best day, positive P&L = green
                // Biggest loss, negative values = red
                // Neutral (win rate %, longest hold) = purple
                let valueColor = '#a855f7'; // default purple
                let borderColor = '#a855f7';

                if (h.type === 'overall_pnl') {
                  valueColor = h.metadata?.isProfit ? '#22c55e' : '#ef4444';
                  borderColor = valueColor;
                } else if (h.type === 'biggest_win') {
                  valueColor = '#22c55e'; // green for wins
                  borderColor = '#22c55e';
                } else if (h.type === 'biggest_loss') {
                  valueColor = '#ef4444'; // red for losses
                  borderColor = '#ef4444';
                } else if (h.type === 'best_day' || h.type === 'best_profit_day') {
                  // Best day: green if positive, red if negative
                  const isPositive = typeof value === 'string' && (value.startsWith('+') || (!value.startsWith('-') && value.includes('$')));
                  const isNegative = typeof value === 'string' && value.startsWith('-');
                  valueColor = isNegative ? '#ef4444' : isPositive ? '#22c55e' : '#a855f7';
                  borderColor = valueColor;
                }
                // win_rate and longest_hold stay purple

                // Shorten titles and add token symbol where relevant
                let shortTitle = h.title
                  .replace('Overall P&L', 'Total P&L')
                  .replace('Diamond Hands', 'Longest Hold');

                // Add token ticker for relevant highlights
                if (tokenSymbol && ['biggest_win', 'biggest_loss', 'longest_hold'].includes(h.type)) {
                  shortTitle = `${shortTitle} ($${tokenSymbol})`;
                }

                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: `${s(10)}px ${s(12)}px`,
                      background: 'rgba(20, 20, 40, 0.5)',
                      border: `${s(1)}px solid ${borderColor}20`,
                      borderRadius: `${s(8)}px`,
                      borderLeft: `${s(3)}px solid ${borderColor}`,
                    }}
                  >
                    {/* Left side - Title */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: `${s(1)}px`,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          fontSize: `${s(10)}px`,
                          color: '#ffffff',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          fontWeight: '500',
                        }}
                      >
                        {shortTitle}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          fontSize: `${s(9)}px`,
                          color: '#6b7280',
                        }}
                      >
                        {typeof subtitle === 'string' ? subtitle : String(subtitle)}
                      </div>
                    </div>

                    {/* Right side - Large Value with dynamic font sizing */}
                    <div
                      style={{
                        display: 'flex',
                        fontSize: `${s(typeof value === 'string' && value.length > 10 ? (value.length > 14 ? 14 : 18) : 22)}px`,
                        fontWeight: '700',
                        color: valueColor,
                        textShadow: `0 0 ${s(25)}px ${valueColor}40`,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {typeof value === 'string' && value.length > 16
                        ? value.slice(0, 15) + '…'
                        : value}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer - minimal */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                marginTop: `${s(12)}px`,
                paddingTop: `${s(10)}px`,
                borderTop: `${s(1)}px solid rgba(139, 92, 246, 0.15)`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${s(6)}px`,
                }}
              >
                {/* Logo icon - Calendar */}
                <svg
                  width={s(20)}
                  height={s(20)}
                  viewBox="0 0 64 64"
                  style={{ display: 'flex' }}
                >
                  {/* Calendar base */}
                  <rect x="10" y="14" width="44" height="40" rx="4" fill="#1a1a2e" stroke="url(#borderGrad)" strokeWidth="2" />
                  {/* Calendar header */}
                  <rect x="10" y="14" width="44" height="10" rx="4" fill="#2a2a42" />
                  <rect x="10" y="20" width="44" height="4" fill="#2a2a42" />
                  {/* Calendar rings */}
                  <rect x="18" y="10" width="3" height="8" rx="1.5" fill="#ffd700" />
                  <rect x="31" y="10" width="3" height="8" rx="1.5" fill="#ff6b9d" />
                  <rect x="44" y="10" width="3" height="8" rx="1.5" fill="#9d4edd" />
                  {/* Activity dots */}
                  <circle cx="17" cy="31" r="2" fill="#10b981" />
                  <circle cx="23" cy="31" r="2" fill="#ffd700" />
                  <circle cx="35" cy="37" r="2" fill="#ff6b9d" />
                  <circle cx="41" cy="37" r="2" fill="#10b981" />
                  <circle cx="29" cy="43" r="2" fill="#9d4edd" />
                  <circle cx="47" cy="43" r="2" fill="#ffd700" />
                  {/* Trend line */}
                  <path d="M 14 48 L 20 44 L 26 46 L 32 38 L 38 40 L 44 35 L 50 32" stroke="#10b981" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.7" />
                  <defs>
                    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffd700" />
                      <stop offset="50%" stopColor="#ff6b9d" />
                      <stop offset="100%" stopColor="#9d4edd" />
                    </linearGradient>
                  </defs>
                </svg>
                <span style={{ display: 'flex', fontSize: `${s(9)}px`, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>powered by</span>
                <span style={{ display: 'flex', fontSize: `${s(12)}px`, fontWeight: 'bold', background: 'linear-gradient(90deg, #ffd700 0%, #ff6b9d 50%, #9d4edd 100%)', backgroundClip: 'text', color: 'transparent' }}>
                  $WRAPPED
                </span>
                <span style={{ display: 'flex', fontSize: `${s(9)}px`, color: '#9ca3af', marginLeft: `${s(4)}px` }}>
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
          cachedInterFont && {
            name: 'Inter',
            data: cachedInterFont,
            weight: 400,
            style: 'normal',
          },
          cachedInterBold && {
            name: 'Inter',
            data: cachedInterBold,
            weight: 700,
            style: 'normal',
          },
        ].filter(Boolean) as any[],
      }
    );

    imageResponse.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    imageResponse.headers.set('Content-Type', 'image/png');

    return imageResponse;
  } catch (error) {
    console.error('[Summary Card API] Failed to generate card:', error);

    return new ImageResponse(
      (
        <div
          style={{
            width: '800px',
            height: '1000px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0d0d1a 100%)',
            border: '4px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '32px',
            fontFamily: 'Inter',
          }}
        >
          <div style={{ fontSize: '48px', fontWeight: '700', color: '#ef4444' }}>
            Failed to Load Summary
          </div>
          <div style={{ fontSize: '24px', color: '#9ca3af', marginTop: '16px' }}>
            {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        </div>
      ),
      { width: 800, height: 1000 }
    );
  }
}

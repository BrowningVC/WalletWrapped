import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// Cache fonts at module level (persists across requests in edge runtime)
let cachedInterFont: ArrayBuffer | null = null;
let cachedInterBold: ArrayBuffer | null = null;
let fontLoadPromise: Promise<void> | null = null;

// Cache highlights data to avoid redundant API calls (edge runtime module-level cache)
// Key: walletAddress, Value: { data, timestamp }
const highlightsCache = new Map<string, { data: any; timestamp: number }>();
const HIGHLIGHTS_CACHE_TTL = 60 * 1000; // 60 seconds (highlights don't change often)

// Fetch fonts from Google Fonts
async function getFont(font: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const API = `https://fonts.googleapis.com/css2?family=${font}:wght@${weight}&display=swap`;

    const css = await (
      await fetch(API, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1',
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

// Load and cache fonts once
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

// Fetch highlights with caching to avoid redundant API calls for same wallet
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
    const errorText = await response.text();
    throw new Error(`Failed to fetch highlights: ${response.status} ${errorText}`);
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

// Firework theme colors
const COLORS = {
  profit: {
    border: 'rgba(34, 197, 94, 0.4)',
    glow: 'rgba(34, 197, 94, 0.15)',
    text: '#22c55e',
  },
  loss: {
    border: 'rgba(239, 68, 68, 0.4)',
    glow: 'rgba(239, 68, 68, 0.15)',
    text: '#ef4444',
  },
  neutral: {
    border: 'rgba(139, 92, 246, 0.4)',
    glow: 'rgba(139, 92, 246, 0.15)',
    text: '#a855f7',
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string; index: string }> }
) {
  try {
    const { address, index } = await params;
    const cardIndex = parseInt(index, 10);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

    // Try to get pre-generated card from server cache first (instant!)
    try {
      const cacheResponse = await fetch(`${apiUrl}/api/wallet/${address}/card/${index}`, {
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

    // Load fonts (cached after first request) and fetch highlight data in parallel
    // Both are cached, so subsequent requests for same wallet are very fast
    const [, highlights] = await Promise.all([
      loadFonts(),
      getHighlights(address, apiUrl),
    ]);

    console.log(`[Card API] Cache miss, generating card ${cardIndex} for ${address}`);

    const highlight = highlights[cardIndex];

    if (!highlight) {
      console.error(`[Card API] Highlight ${cardIndex} not found in array of ${highlights.length}`);
      throw new Error(`Highlight not found at index ${cardIndex}`);
    }

    // Determine color scheme
    const colorScheme =
      highlight.metadata.isProfit === true ? 'profit' :
      highlight.metadata.isProfit === false ? 'loss' :
      'neutral';

    const colors = COLORS[colorScheme];

    // Format values
    const value = highlight.metadata.formattedPrimary || highlight.valuePrimary;
    const subtitle = highlight.metadata.formattedSecondary || highlight.valueSecondary;
    const title = highlight.title;
    const context = highlight.description;
    const type = '2025 WRAPPED';
    const highlightType = highlight.type;
    const tokenSymbol = highlight.metadata?.tokenSymbol;

    // Determine if this card should show a prominent ticker/date
    const showProminentTicker = ['biggest_win', 'biggest_loss', 'longest_hold'].includes(highlightType) && tokenSymbol;
    const showProminentDate = highlightType === 'best_day' || highlightType === 'best_profit_day';

    // Calculate font size based on value length (ensure it fits in 344px width)
    // Container width: 400px - 56px padding = 344px usable width
    const getValueFontSize = (len: number) => {
      if (len > 16) return 32;   // Very long values like "-$1,234,567.89"
      if (len > 14) return 38;   // Long values like "+$352,898.12"
      if (len > 12) return 44;   // Medium-long values like "+$352,898"
      if (len > 10) return 52;   // Medium values like "+$52,898"
      if (len > 8) return 60;    // Short-medium values
      if (len > 6) return 70;    // Short values
      if (len > 4) return 80;    // Very short values
      return 88;                  // Tiny values
    };

    const valueFontSize = getValueFontSize(value.length);

    // Determine value color based on positive/negative (green for +, red for -)
    // This is independent of the card's overall color scheme
    const isPositiveValue = typeof value === 'string' && (value.startsWith('+') || (!value.startsWith('-') && value.includes('$')));
    const isNegativeValue = typeof value === 'string' && value.startsWith('-');
    const valueColor = isPositiveValue ? '#22c55e' : isNegativeValue ? '#ef4444' : colors.text;

    // Generate at 2x resolution for HD/Retina displays
    // All dimensions doubled for crisp rendering
    const scale = 2;
    const width = 400 * scale;  // 800px
    const height = 520 * scale; // 1040px

    // Helper to scale values
    const s = (v: number) => v * scale;

    const imageResponse = new ImageResponse(
      (
        <div
          style={{
            width: `${width}px`,
            height: `${height}px`,
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #0a0a1a 100%)',
            position: 'relative',
            fontFamily: 'Inter',
            overflow: 'hidden',
          }}
        >
          {/* Vibrant gradient orbs */}
          <div
            style={{
              position: 'absolute',
              top: `${s(-100)}px`,
              right: `${s(-100)}px`,
              width: `${s(300)}px`,
              height: `${s(300)}px`,
              background: `radial-gradient(circle, ${colors.text}25 0%, ${colors.text}10 40%, transparent 70%)`,
              borderRadius: '50%',
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: `${s(-120)}px`,
              left: `${s(-120)}px`,
              width: `${s(350)}px`,
              height: `${s(350)}px`,
              background: 'radial-gradient(circle, #a855f720 0%, #a855f710 40%, transparent 70%)',
              borderRadius: '50%',
              display: 'flex',
            }}
          />

          {/* Sparkle particles */}
          <div style={{ position: 'absolute', top: `${s(80)}px`, right: `${s(60)}px`, width: `${s(8)}px`, height: `${s(8)}px`, background: '#ffd700', borderRadius: '50%', opacity: 0.6, display: 'flex' }} />
          <div style={{ position: 'absolute', top: `${s(140)}px`, right: `${s(120)}px`, width: `${s(6)}px`, height: `${s(6)}px`, background: '#ff6b9d', borderRadius: '50%', opacity: 0.5, display: 'flex' }} />
          <div style={{ position: 'absolute', top: `${s(200)}px`, left: `${s(40)}px`, width: `${s(7)}px`, height: `${s(7)}px`, background: colors.text, borderRadius: '50%', opacity: 0.4, display: 'flex' }} />
          <div style={{ position: 'absolute', bottom: `${s(180)}px`, left: `${s(80)}px`, width: `${s(5)}px`, height: `${s(5)}px`, background: '#00f5d4', borderRadius: '50%', opacity: 0.5, display: 'flex' }} />
          <div style={{ position: 'absolute', bottom: `${s(120)}px`, right: `${s(90)}px`, width: `${s(6)}px`, height: `${s(6)}px`, background: '#9d4edd', borderRadius: '50%', opacity: 0.6, display: 'flex' }} />

          {/* Grid pattern */}
          <div
            style={{
              position: 'absolute',
              inset: '0',
              backgroundImage: `linear-gradient(${colors.text}08 ${s(1)}px, transparent ${s(1)}px), linear-gradient(90deg, ${colors.text}08 ${s(1)}px, transparent ${s(1)}px)`,
              backgroundSize: `${s(40)}px ${s(40)}px`,
              display: 'flex',
            }}
          />

          {/* Main content container with border */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              border: `${s(2)}px solid ${colors.border}`,
              borderRadius: `${s(16)}px`,
              boxShadow: `0 ${s(8)}px ${s(32)}px ${colors.glow}, inset 0 0 ${s(80)}px ${colors.glow.replace('0.15', '0.03')}`,
              padding: `${s(28)}px`,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Accent corner lines - more prominent */}
            <div
              style={{
                position: 'absolute',
                top: `${s(12)}px`,
                right: `${s(12)}px`,
                width: `${s(50)}px`,
                height: `${s(50)}px`,
                borderTop: `${s(3)}px solid ${colors.text}60`,
                borderRight: `${s(3)}px solid ${colors.text}60`,
                borderRadius: `0 ${s(14)}px 0 0`,
                display: 'flex',
                boxShadow: `0 0 ${s(15)}px ${colors.text}30`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: `${s(12)}px`,
                left: `${s(12)}px`,
                width: `${s(50)}px`,
                height: `${s(50)}px`,
                borderBottom: `${s(3)}px solid ${colors.text}50`,
                borderLeft: `${s(3)}px solid ${colors.text}50`,
                borderRadius: `0 0 0 ${s(14)}px`,
                display: 'flex',
                boxShadow: `0 0 ${s(15)}px ${colors.text}25`,
              }}
            />

            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: `${s(24)}px`,
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
                    fontSize: `${s(11)}px`,
                    color: colors.text,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    marginBottom: `${s(6)}px`,
                    fontWeight: '600',
                    opacity: 0.8,
                  }}
                >
                  {type}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${s(8)}px`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      fontSize: `${s(28)}px`,
                      fontWeight: '700',
                      background: 'linear-gradient(135deg, #ffffff 0%, #e5e5e5 100%)',
                      backgroundClip: 'text',
                      color: 'transparent',
                      fontFamily: 'Inter',
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {title}
                  </div>
                  {/* Firework icon with gold/pink/purple gradient */}
                  <svg
                    width={s(20)}
                    height={s(20)}
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{ display: 'flex', flexShrink: 0 }}
                  >
                    <defs>
                      <linearGradient id="fireworkGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#ffd700" />
                        <stop offset="50%" stopColor="#ff6b9d" />
                        <stop offset="100%" stopColor="#9d4edd" />
                      </linearGradient>
                    </defs>
                    <circle cx="12" cy="12" r="2" fill="#ffd700" />
                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="url(#fireworkGradient)" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                }}
              >
                <div
                  style={{
                    fontSize: `${s(24)}px`,
                    fontWeight: '900',
                    background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                    backgroundClip: 'text',
                    color: 'transparent',
                    lineHeight: 1,
                    display: 'flex',
                  }}
                >
                  2025
                </div>
                <div
                  style={{
                    fontSize: `${s(9)}px`,
                    color: '#a855f7',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginTop: `${s(4)}px`,
                    display: 'flex',
                  }}
                >
                  WRAPPED
                </div>
              </div>
            </div>

            {/* Prominent Ticker/Date Display */}
            {showProminentTicker && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${s(10)}px`,
                  marginBottom: `${s(16)}px`,
                  padding: `${s(12)}px ${s(16)}px`,
                  background: `linear-gradient(135deg, ${colors.text}15 0%, ${colors.text}08 100%)`,
                  borderRadius: `${s(12)}px`,
                  border: `${s(1)}px solid ${colors.text}30`,
                }}
              >
                {/* Calendar icon */}
                <svg
                  width={s(40)}
                  height={s(40)}
                  viewBox="0 0 64 64"
                  style={{ display: 'flex' }}
                >
                  {/* Calendar base */}
                  <rect x="10" y="14" width="44" height="40" rx="4" fill="#1a1a2e" stroke="url(#borderGradToken)" strokeWidth="2" />
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
                    <linearGradient id="borderGradToken" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffd700" />
                      <stop offset="50%" stopColor="#ff6b9d" />
                      <stop offset="100%" stopColor="#9d4edd" />
                    </linearGradient>
                  </defs>
                </svg>
                <div
                  style={{
                    display: 'flex',
                    fontSize: `${s(28)}px`,
                    fontWeight: '800',
                    color: colors.text,
                    letterSpacing: '-0.02em',
                    textShadow: `0 0 ${s(30)}px ${colors.text}40`,
                  }}
                >
                  ${tokenSymbol}
                </div>
              </div>
            )}
            {showProminentDate && subtitle && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${s(10)}px`,
                  marginBottom: `${s(16)}px`,
                  padding: `${s(12)}px ${s(16)}px`,
                  background: `linear-gradient(135deg, ${colors.text}15 0%, ${colors.text}08 100%)`,
                  borderRadius: `${s(12)}px`,
                  border: `${s(1)}px solid ${colors.text}30`,
                }}
              >
                {/* Calendar icon matching main logo style */}
                <svg width={s(40)} height={s(40)} viewBox="0 0 64 64" fill="none" style={{ display: 'flex', flexShrink: 0 }}>
                  {/* Calendar base */}
                  <rect x="10" y="14" width="44" height="40" rx="4" fill="#1a1a2e" stroke={colors.text} strokeWidth="2" />
                  {/* Calendar header bar */}
                  <rect x="10" y="14" width="44" height="10" rx="4" fill={colors.text} />
                  <rect x="10" y="20" width="44" height="4" fill={colors.text} />
                  {/* Calendar rings/binding */}
                  <rect x="18" y="10" width="3" height="8" rx="1.5" fill={colors.text} />
                  <rect x="31" y="10" width="3" height="8" rx="1.5" fill={colors.text} />
                  <rect x="44" y="10" width="3" height="8" rx="1.5" fill={colors.text} />
                  {/* Highlighted day indicator */}
                  <circle cx="32" cy="37" r="8" fill={colors.text} opacity="0.3" />
                  <circle cx="32" cy="37" r="5" fill={colors.text} />
                </svg>
                <div
                  style={{
                    display: 'flex',
                    fontSize: `${s(24)}px`,
                    fontWeight: '800',
                    color: colors.text,
                    letterSpacing: '-0.02em',
                    textShadow: `0 0 ${s(30)}px ${colors.text}40`,
                  }}
                >
                  {subtitle}
                </div>
              </div>
            )}

            {/* Main value section */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'flex-start',
                flex: 1,
                position: 'relative',
              }}
            >
              {/* Accent bar beside value */}
              <div
                style={{
                  position: 'absolute',
                  left: `${s(-28)}px`,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: `${s(4)}px`,
                  height: `${s(80)}px`,
                  background: `linear-gradient(180deg, transparent 0%, ${colors.text} 50%, transparent 100%)`,
                  borderRadius: `${s(2)}px`,
                  display: 'flex',
                }}
              />

              <div
                style={{
                  display: 'flex',
                  fontSize: `${s(valueFontSize)}px`,
                  fontWeight: 900,
                  color: valueColor,
                  lineHeight: 0.9,
                  textShadow: `0 0 ${s(60)}px ${valueColor}50, 0 0 ${s(30)}px ${valueColor}30, 0 ${s(2)}px ${s(4)}px rgba(0,0,0,0.5)`,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'clip',
                  fontFamily: 'Inter',
                  letterSpacing: '-0.06em',
                  maxWidth: `${s(340)}px`,
                  filter: 'brightness(1.1)',
                }}
              >
                {value}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: `${s(22)}px`,
                  color: colors.text,
                  marginTop: `${s(16)}px`,
                  fontWeight: 600,
                  fontStyle: 'italic',
                  opacity: 0.9,
                  letterSpacing: '0.01em',
                  textShadow: `0 0 ${s(20)}px ${colors.text}25`,
                }}
              >
                {subtitle}
              </div>
            </div>

            {/* Bottom section */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Context with accent */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  marginBottom: `${s(18)}px`,
                }}
              >
                <div
                  style={{
                    width: `${s(60)}px`,
                    height: `${s(2)}px`,
                    background: `linear-gradient(90deg, ${colors.text} 0%, transparent 100%)`,
                    marginBottom: `${s(10)}px`,
                    display: 'flex',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    fontSize: `${s(18)}px`,
                    background: `linear-gradient(135deg, #ffffff 0%, ${colors.text} 50%, #a855f7 100%)`,
                    backgroundClip: 'text',
                    color: 'transparent',
                    lineHeight: 1.5,
                    letterSpacing: '-0.01em',
                    fontWeight: 600,
                    textShadow: `0 0 ${s(30)}px ${colors.text}20`,
                  }}
                >
                  {context}
                </div>
              </div>

              {/* Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  paddingTop: `${s(14)}px`,
                  borderTop: `${s(1)}px solid ${colors.border.replace('0.4', '0.25')}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${s(5)}px`,
                  }}
                >
                  <span style={{ display: 'flex', fontSize: `${s(10)}px`, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>powered by</span>
                  <span style={{ display: 'flex', fontSize: `${s(13)}px`, fontWeight: 'bold', background: 'linear-gradient(90deg, #ffd700 0%, #ff6b9d 50%, #9d4edd 100%)', backgroundClip: 'text', color: 'transparent' }}>
                    $WRAPPED
                  </span>
                  <span style={{ display: 'flex', fontSize: `${s(10)}px`, color: '#9ca3af', marginLeft: `${s(4)}px` }}>
                    walletwrapped.io
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width,  // 800px for HD
        height, // 1040px for HD
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

    // Add headers to help with clipboard copying
    imageResponse.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    imageResponse.headers.set('Content-Type', 'image/png');

    return imageResponse;
  } catch (error) {
    console.error('[Card API] Failed to generate card image:', error);

    // Return an error image at 2x resolution
    return new ImageResponse(
      (
        <div
          style={{
            width: '800px',
            height: '1040px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0d0d1a 100%)',
            border: '4px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '32px',
            padding: '48px',
            textAlign: 'center',
            fontFamily: 'Inter',
          }}
        >
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '32px',
          }}>
            <div style={{ fontSize: '48px', fontWeight: '700', color: '#ef4444', letterSpacing: '-0.02em' }}>
              Failed to Load Card
            </div>
            <div style={{ fontSize: '28px', color: '#9ca3af', maxWidth: '600px' }}>
              {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          </div>
        </div>
      ),
      {
        width: 800,
        height: 1040,
      }
    );
  }
}

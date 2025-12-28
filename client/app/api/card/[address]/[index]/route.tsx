import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

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

    // Fetch highlight data and fonts in parallel
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
    console.log(`[Card API] Fetching highlights from: ${apiUrl}/api/wallet/${address}/highlights`);

    const [response, interFont, interBold] = await Promise.all([
      fetch(`${apiUrl}/api/wallet/${address}/highlights`),
      getFont('Inter', 400),
      getFont('Inter', 700),
    ]);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Card API] Highlights fetch failed:`, response.status, errorText);
      throw new Error(`Failed to fetch highlights: ${response.status} ${errorText}`);
    }

    const highlights = await response.json();
    console.log(`[Card API] Got ${highlights.length} highlights, requesting index ${cardIndex}`);

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
    const type = highlight.type === 'overall_pnl' ? '2025 WRAPPED' : highlight.type.replace(/_/g, ' ').toUpperCase();

    // Calculate font size based on value length (ensure it fits in 344px width)
    // Container width: 400px - 56px padding = 344px usable width
    const getValueFontSize = (len: number) => {
      if (len > 18) return 38;   // Very long values
      if (len > 15) return 44;   // Long values
      if (len > 13) return 50;   // Medium-long values like "+$12,909.9"
      if (len > 11) return 56;   // Medium values
      if (len > 9) return 64;    // Short-medium values
      if (len > 7) return 72;    // Short values
      if (len > 5) return 80;    // Very short values
      return 88;                  // Tiny values
    };

    const valueFontSize = getValueFontSize(value.length);

    const imageResponse = new ImageResponse(
      (
        <div
          style={{
            width: '400px',
            height: '520px',
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
              top: '-100px',
              right: '-100px',
              width: '300px',
              height: '300px',
              background: `radial-gradient(circle, ${colors.text}25 0%, ${colors.text}10 40%, transparent 70%)`,
              borderRadius: '50%',
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '-120px',
              left: '-120px',
              width: '350px',
              height: '350px',
              background: 'radial-gradient(circle, #a855f720 0%, #a855f710 40%, transparent 70%)',
              borderRadius: '50%',
              display: 'flex',
            }}
          />

          {/* Sparkle particles */}
          <div style={{ position: 'absolute', top: '80px', right: '60px', width: '8px', height: '8px', background: '#ffd700', borderRadius: '50%', opacity: 0.6, display: 'flex' }} />
          <div style={{ position: 'absolute', top: '140px', right: '120px', width: '6px', height: '6px', background: '#ff6b9d', borderRadius: '50%', opacity: 0.5, display: 'flex' }} />
          <div style={{ position: 'absolute', top: '200px', left: '40px', width: '7px', height: '7px', background: colors.text, borderRadius: '50%', opacity: 0.4, display: 'flex' }} />
          <div style={{ position: 'absolute', bottom: '180px', left: '80px', width: '5px', height: '5px', background: '#00f5d4', borderRadius: '50%', opacity: 0.5, display: 'flex' }} />
          <div style={{ position: 'absolute', bottom: '120px', right: '90px', width: '6px', height: '6px', background: '#9d4edd', borderRadius: '50%', opacity: 0.6, display: 'flex' }} />

          {/* Grid pattern */}
          <div
            style={{
              position: 'absolute',
              inset: '0',
              backgroundImage: `linear-gradient(${colors.text}08 1px, transparent 1px), linear-gradient(90deg, ${colors.text}08 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
              display: 'flex',
            }}
          />

          {/* Main content container with border */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              border: `2px solid ${colors.border}`,
              borderRadius: '16px',
              boxShadow: `0 8px 32px ${colors.glow}, inset 0 0 80px ${colors.glow.replace('0.15', '0.03')}`,
              padding: '28px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Accent corner lines - more prominent */}
            <div
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: '50px',
                height: '50px',
                borderTop: `3px solid ${colors.text}60`,
                borderRight: `3px solid ${colors.text}60`,
                borderRadius: '0 14px 0 0',
                display: 'flex',
                boxShadow: `0 0 15px ${colors.text}30`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                left: '12px',
                width: '50px',
                height: '50px',
                borderBottom: `3px solid ${colors.text}50`,
                borderLeft: `3px solid ${colors.text}50`,
                borderRadius: '0 0 0 14px',
                display: 'flex',
                boxShadow: `0 0 15px ${colors.text}25`,
              }}
            />

            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '24px',
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
                    fontSize: '11px',
                    color: colors.text,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    marginBottom: '6px',
                    fontWeight: '600',
                    opacity: 0.8,
                  }}
                >
                  {type}
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: '28px',
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
                    fontSize: '24px',
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
                    fontSize: '9px',
                    color: '#a855f7',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginTop: '4px',
                    display: 'flex',
                  }}
                >
                  WRAPPED
                </div>
              </div>
            </div>

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
                  left: '-28px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '4px',
                  height: '80px',
                  background: `linear-gradient(180deg, transparent 0%, ${colors.text} 50%, transparent 100%)`,
                  borderRadius: '2px',
                  display: 'flex',
                }}
              />

              <div
                style={{
                  display: 'flex',
                  fontSize: `${valueFontSize}px`,
                  fontWeight: 900,
                  color: colors.text,
                  lineHeight: 0.9,
                  textShadow: `0 0 60px ${colors.text}50, 0 0 30px ${colors.text}30, 0 2px 4px rgba(0,0,0,0.5)`,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'clip',
                  fontFamily: 'Inter',
                  letterSpacing: '-0.06em',
                  maxWidth: '340px',
                  filter: 'brightness(1.1)',
                }}
              >
                {value}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: '22px',
                  color: colors.text,
                  marginTop: '16px',
                  fontWeight: 600,
                  fontStyle: 'italic',
                  opacity: 0.9,
                  letterSpacing: '0.01em',
                  textShadow: `0 0 20px ${colors.text}25`,
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
                  marginBottom: '18px',
                }}
              >
                <div
                  style={{
                    width: '60px',
                    height: '2px',
                    background: `linear-gradient(90deg, ${colors.text} 0%, transparent 100%)`,
                    marginBottom: '10px',
                    display: 'flex',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    fontSize: '15px',
                    color: 'rgba(209, 213, 217, 0.75)',
                    lineHeight: 1.5,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {context}
                </div>
              </div>

              {/* Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '14px',
                  borderTop: `1px solid ${colors.border.replace('0.4', '0.25')}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: colors.text,
                      opacity: 0.5,
                      display: 'flex',
                    }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      color: '#9ca3af',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {address.slice(0, 4)}...{address.slice(-4)}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <span style={{ display: 'flex', fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>powered by</span>
                  <span style={{ display: 'flex', fontSize: '13px', fontWeight: 'bold', background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)', backgroundClip: 'text', color: 'transparent' }}>
                    $WRAPPED
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 400,
        height: 520,
        fonts: [
          interFont && {
            name: 'Inter',
            data: interFont,
            weight: 400,
            style: 'normal',
          },
          interBold && {
            name: 'Inter',
            data: interBold,
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

    // Return an error image
    return new ImageResponse(
      (
        <div
          style={{
            width: '400px',
            height: '520px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0d0d1a 100%)',
            border: '2px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '16px',
            padding: '24px',
            textAlign: 'center',
            fontFamily: 'Inter',
          }}
        >
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#ef4444', letterSpacing: '-0.02em' }}>
              Failed to Load Card
            </div>
            <div style={{ fontSize: '14px', color: '#9ca3af', maxWidth: '300px' }}>
              {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          </div>
        </div>
      ),
      {
        width: 400,
        height: 520,
      }
    );
  }
}

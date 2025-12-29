const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

// Satori is an ES module with default export - need dynamic import
let satori = null;
let satoriLoadPromise = null;

async function loadSatori() {
  if (satori) return satori;
  if (satoriLoadPromise) return satoriLoadPromise;

  satoriLoadPromise = (async () => {
    const satoriModule = await import('satori');
    satori = satoriModule.default;
    console.log('[CardGen] Satori module loaded successfully');
    return satori;
  })();

  return satoriLoadPromise;
}

/**
 * Server-side Card Image Generator
 * Uses Satori + Resvg to generate PNG cards without requiring a separate client deployment
 */

// Cache font data
let interRegular = null;
let interBold = null;
let fontLoadAttempted = false;
let fontLoadPromise = null;

// Load fonts from bundled files
async function loadFonts() {
  // Return cached fonts if already loaded
  if (interRegular && interBold) return true;

  // If already loading, wait for that promise
  if (fontLoadPromise) {
    await fontLoadPromise;
    return !!(interRegular && interBold);
  }

  fontLoadPromise = (async () => {
    try {
      console.log('[CardGen] Loading bundled fonts from disk...');

      const fontsDir = path.join(__dirname, '..', 'assets', 'fonts');
      const regularPath = path.join(fontsDir, 'Inter-Regular.ttf');
      const boldPath = path.join(fontsDir, 'Inter-Bold.ttf');

      // Check if font files exist
      if (!fs.existsSync(regularPath)) {
        console.error('[CardGen] Inter-Regular.ttf not found at:', regularPath);
        return false;
      }
      if (!fs.existsSync(boldPath)) {
        console.error('[CardGen] Inter-Bold.ttf not found at:', boldPath);
        return false;
      }

      // Load fonts from disk
      interRegular = fs.readFileSync(regularPath);
      interBold = fs.readFileSync(boldPath);

      console.log(`[CardGen] Inter-Regular loaded (${interRegular.length} bytes)`);
      console.log(`[CardGen] Inter-Bold loaded (${interBold.length} bytes)`);
      console.log('[CardGen] All fonts loaded successfully from bundled files');
      return true;
    } catch (error) {
      console.error('[CardGen] Font loading failed:', error.message);
      return false;
    } finally {
      fontLoadAttempted = true;
    }
  })();

  return fontLoadPromise;
}

// Color schemes
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

/**
 * Generate a card image for a specific highlight
 * Matches the client-side design exactly for 1:1 parity
 * @param {Object} highlight - Highlight data from database
 * @param {string} walletAddress - Wallet address for display
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateCard(highlight, walletAddress) {
  // Load satori (ES module with dynamic import)
  await loadSatori();
  if (!satori) {
    throw new Error('Satori not available - cannot generate card');
  }

  const fontsLoaded = await loadFonts();
  if (!fontsLoaded) {
    throw new Error('Fonts not available - cannot generate card');
  }

  // Determine color scheme
  const colorScheme =
    highlight.metadata?.isProfit === true ? 'profit' :
    highlight.metadata?.isProfit === false ? 'loss' :
    'neutral';
  const colors = COLORS[colorScheme];

  // Format values
  const value = highlight.metadata?.formattedPrimary || highlight.value_primary || '';
  const subtitle = highlight.metadata?.formattedSecondary || highlight.value_secondary || '';
  const title = highlight.title || '';
  const context = highlight.description || '';
  const highlightType = highlight.highlight_type;
  const tokenSymbol = highlight.metadata?.tokenSymbol;

  // Calculate font size based on value length (matching client exactly)
  const getValueFontSize = (len) => {
    if (len > 16) return 32;
    if (len > 14) return 38;
    if (len > 12) return 44;
    if (len > 10) return 52;
    if (len > 8) return 60;
    if (len > 6) return 70;
    if (len > 4) return 80;
    return 88;
  };
  const valueFontSize = getValueFontSize(value.length);

  // Determine value color (matching client exactly)
  const isPositive = typeof value === 'string' && (value.startsWith('+') || (!value.startsWith('-') && value.includes('$')));
  const isNegative = typeof value === 'string' && value.startsWith('-');
  const valueColor = isPositive ? '#22c55e' : isNegative ? '#ef4444' : colors.text;

  // Show ticker/date for certain highlight types (matching client)
  const showProminentTicker = ['biggest_win', 'biggest_loss', 'longest_hold'].includes(highlightType) && tokenSymbol;
  const showProminentDate = (highlightType === 'best_day' || highlightType === 'best_profit_day') && subtitle;

  // Scale factor for 2x resolution (matching client's HD output)
  const scale = 2;
  const s = (v) => v * scale;

  // Build JSX-like structure for Satori (matching client exactly)
  const jsx = {
    type: 'div',
    props: {
      style: {
        width: `${s(400)}px`,
        height: `${s(520)}px`,
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #0a0a1a 100%)',
        position: 'relative',
        fontFamily: 'Inter',
        overflow: 'hidden',
      },
      children: [
        // Vibrant gradient orb (top-right)
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: `${s(-100)}px`,
              right: `${s(-100)}px`,
              width: `${s(300)}px`,
              height: `${s(300)}px`,
              background: `radial-gradient(circle, ${colors.text}25 0%, ${colors.text}10 40%, transparent 70%)`,
              borderRadius: '50%',
              display: 'flex',
            },
          },
        },
        // Vibrant gradient orb (bottom-left)
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: `${s(-120)}px`,
              left: `${s(-120)}px`,
              width: `${s(350)}px`,
              height: `${s(350)}px`,
              background: 'radial-gradient(circle, #a855f720 0%, #a855f710 40%, transparent 70%)',
              borderRadius: '50%',
              display: 'flex',
            },
          },
        },
        // Sparkle particles
        { type: 'div', props: { style: { position: 'absolute', top: `${s(80)}px`, right: `${s(60)}px`, width: `${s(8)}px`, height: `${s(8)}px`, background: '#ffd700', borderRadius: '50%', opacity: 0.6, display: 'flex' } } },
        { type: 'div', props: { style: { position: 'absolute', top: `${s(140)}px`, right: `${s(120)}px`, width: `${s(6)}px`, height: `${s(6)}px`, background: '#ff6b9d', borderRadius: '50%', opacity: 0.5, display: 'flex' } } },
        { type: 'div', props: { style: { position: 'absolute', top: `${s(200)}px`, left: `${s(40)}px`, width: `${s(7)}px`, height: `${s(7)}px`, background: colors.text, borderRadius: '50%', opacity: 0.4, display: 'flex' } } },
        { type: 'div', props: { style: { position: 'absolute', bottom: `${s(180)}px`, left: `${s(80)}px`, width: `${s(5)}px`, height: `${s(5)}px`, background: '#00f5d4', borderRadius: '50%', opacity: 0.5, display: 'flex' } } },
        { type: 'div', props: { style: { position: 'absolute', bottom: `${s(120)}px`, right: `${s(90)}px`, width: `${s(6)}px`, height: `${s(6)}px`, background: '#9d4edd', borderRadius: '50%', opacity: 0.6, display: 'flex' } } },
        // Grid pattern
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: `linear-gradient(${colors.text}08 ${s(1)}px, transparent ${s(1)}px), linear-gradient(90deg, ${colors.text}08 ${s(1)}px, transparent ${s(1)}px)`,
              backgroundSize: `${s(40)}px ${s(40)}px`,
              display: 'flex',
            },
          },
        },
        // Main content container with border
        {
          type: 'div',
          props: {
            style: {
              position: 'relative',
              width: '100%',
              height: '100%',
              border: `${s(2)}px solid ${colors.border}`,
              borderRadius: `${s(16)}px`,
              padding: `${s(28)}px`,
              display: 'flex',
              flexDirection: 'column',
            },
            children: [
              // Top-right corner accent
              {
                type: 'div',
                props: {
                  style: {
                    position: 'absolute',
                    top: `${s(12)}px`,
                    right: `${s(12)}px`,
                    width: `${s(50)}px`,
                    height: `${s(50)}px`,
                    borderTop: `${s(3)}px solid ${colors.text}60`,
                    borderRight: `${s(3)}px solid ${colors.text}60`,
                    borderRadius: `0 ${s(14)}px 0 0`,
                    display: 'flex',
                  },
                },
              },
              // Bottom-left corner accent
              {
                type: 'div',
                props: {
                  style: {
                    position: 'absolute',
                    bottom: `${s(12)}px`,
                    left: `${s(12)}px`,
                    width: `${s(50)}px`,
                    height: `${s(50)}px`,
                    borderBottom: `${s(3)}px solid ${colors.text}50`,
                    borderLeft: `${s(3)}px solid ${colors.text}50`,
                    borderRadius: `0 0 0 ${s(14)}px`,
                    display: 'flex',
                  },
                },
              },
              // Header
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: `${s(24)}px`,
                  },
                  children: [
                    // Title section
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', flexDirection: 'column' },
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                fontSize: `${s(11)}px`,
                                color: colors.text,
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em',
                                marginBottom: `${s(6)}px`,
                                fontWeight: '600',
                                opacity: 0.8,
                              },
                              children: '2025 WRAPPED',
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: `${s(8)}px`,
                              },
                              children: [
                                {
                                  type: 'div',
                                  props: {
                                    style: {
                                      display: 'flex',
                                      fontSize: `${s(28)}px`,
                                      fontWeight: '700',
                                      color: '#ffffff',
                                      letterSpacing: '-0.03em',
                                    },
                                    children: title,
                                  },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                    // Year badge
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                        },
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: `${s(24)}px`,
                                fontWeight: '900',
                                color: '#a855f7',
                                lineHeight: 1,
                                display: 'flex',
                              },
                              children: '2025',
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: `${s(9)}px`,
                                color: '#a855f7',
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                marginTop: `${s(4)}px`,
                                display: 'flex',
                              },
                              children: 'WRAPPED',
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
              // Prominent ticker display (for biggest_win, biggest_loss, longest_hold)
              ...(showProminentTicker ? [{
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${s(10)}px`,
                    marginBottom: `${s(16)}px`,
                    padding: `${s(12)}px ${s(16)}px`,
                    background: `linear-gradient(135deg, ${colors.text}15 0%, ${colors.text}08 100%)`,
                    borderRadius: `${s(12)}px`,
                    border: `${s(1)}px solid ${colors.text}30`,
                  },
                  children: [
                    // Calendar icon (matching client design)
                    {
                      type: 'svg',
                      props: {
                        width: s(40),
                        height: s(40),
                        viewBox: '0 0 64 64',
                        style: { display: 'flex' },
                        children: [
                          // Calendar base
                          { type: 'rect', props: { x: 10, y: 14, width: 44, height: 40, rx: 4, fill: '#1a1a2e', stroke: '#ffd700', strokeWidth: 2 } },
                          // Calendar header
                          { type: 'rect', props: { x: 10, y: 14, width: 44, height: 10, rx: 4, fill: '#2a2a42' } },
                          { type: 'rect', props: { x: 10, y: 20, width: 44, height: 4, fill: '#2a2a42' } },
                          // Calendar rings
                          { type: 'rect', props: { x: 18, y: 10, width: 3, height: 8, rx: 1.5, fill: '#ffd700' } },
                          { type: 'rect', props: { x: 31, y: 10, width: 3, height: 8, rx: 1.5, fill: '#ff6b9d' } },
                          { type: 'rect', props: { x: 44, y: 10, width: 3, height: 8, rx: 1.5, fill: '#9d4edd' } },
                          // Activity dots
                          { type: 'circle', props: { cx: 17, cy: 31, r: 2, fill: '#10b981' } },
                          { type: 'circle', props: { cx: 23, cy: 31, r: 2, fill: '#ffd700' } },
                          { type: 'circle', props: { cx: 35, cy: 37, r: 2, fill: '#ff6b9d' } },
                          { type: 'circle', props: { cx: 41, cy: 37, r: 2, fill: '#10b981' } },
                          { type: 'circle', props: { cx: 29, cy: 43, r: 2, fill: '#9d4edd' } },
                          { type: 'circle', props: { cx: 47, cy: 43, r: 2, fill: '#ffd700' } },
                          // Trend line
                          { type: 'path', props: { d: 'M 14 48 L 20 44 L 26 46 L 32 38 L 38 40 L 44 35 L 50 32', stroke: '#10b981', strokeWidth: 2, strokeLinecap: 'round', fill: 'none', opacity: 0.7 } },
                        ],
                      },
                    },
                    // Ticker text
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          fontSize: `${s(28)}px`,
                          fontWeight: '800',
                          color: colors.text,
                          letterSpacing: '-0.02em',
                        },
                        children: `$${tokenSymbol}`,
                      },
                    },
                  ],
                },
              }] : []),
              // Prominent date display (for best_day, best_profit_day)
              ...(showProminentDate ? [{
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${s(10)}px`,
                    marginBottom: `${s(16)}px`,
                    padding: `${s(12)}px ${s(16)}px`,
                    background: `linear-gradient(135deg, ${colors.text}15 0%, ${colors.text}08 100%)`,
                    borderRadius: `${s(12)}px`,
                    border: `${s(1)}px solid ${colors.text}30`,
                  },
                  children: [
                    // Calendar icon (themed with card color)
                    {
                      type: 'svg',
                      props: {
                        width: s(40),
                        height: s(40),
                        viewBox: '0 0 64 64',
                        fill: 'none',
                        style: { display: 'flex', flexShrink: 0 },
                        children: [
                          // Calendar base
                          { type: 'rect', props: { x: 10, y: 14, width: 44, height: 40, rx: 4, fill: '#1a1a2e', stroke: colors.text, strokeWidth: 2 } },
                          // Calendar header bar
                          { type: 'rect', props: { x: 10, y: 14, width: 44, height: 10, rx: 4, fill: colors.text } },
                          { type: 'rect', props: { x: 10, y: 20, width: 44, height: 4, fill: colors.text } },
                          // Calendar rings/binding
                          { type: 'rect', props: { x: 18, y: 10, width: 3, height: 8, rx: 1.5, fill: colors.text } },
                          { type: 'rect', props: { x: 31, y: 10, width: 3, height: 8, rx: 1.5, fill: colors.text } },
                          { type: 'rect', props: { x: 44, y: 10, width: 3, height: 8, rx: 1.5, fill: colors.text } },
                          // Highlighted day indicator
                          { type: 'circle', props: { cx: 32, cy: 37, r: 8, fill: colors.text, opacity: 0.3 } },
                          { type: 'circle', props: { cx: 32, cy: 37, r: 5, fill: colors.text } },
                        ],
                      },
                    },
                    // Date text
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          fontSize: `${s(24)}px`,
                          fontWeight: '800',
                          color: colors.text,
                          letterSpacing: '-0.02em',
                        },
                        children: subtitle,
                      },
                    },
                  ],
                },
              }] : []),
              // Main value section
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    flex: 1,
                    position: 'relative',
                  },
                  children: [
                    // Accent bar beside value
                    {
                      type: 'div',
                      props: {
                        style: {
                          position: 'absolute',
                          left: `${s(-28)}px`,
                          top: '50%',
                          width: `${s(4)}px`,
                          height: `${s(80)}px`,
                          background: `linear-gradient(180deg, transparent 0%, ${colors.text} 50%, transparent 100%)`,
                          borderRadius: `${s(2)}px`,
                          display: 'flex',
                        },
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          fontSize: `${s(valueFontSize)}px`,
                          fontWeight: 900,
                          color: valueColor,
                          lineHeight: 0.9,
                          letterSpacing: '-0.06em',
                          maxWidth: `${s(340)}px`,
                        },
                        children: value,
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          fontSize: `${s(22)}px`,
                          color: colors.text,
                          marginTop: `${s(16)}px`,
                          fontWeight: 600,
                          fontStyle: 'italic',
                          opacity: 0.9,
                          letterSpacing: '0.01em',
                        },
                        children: subtitle,
                      },
                    },
                  ],
                },
              },
              // Context section
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    marginBottom: `${s(18)}px`,
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: `${s(60)}px`,
                          height: `${s(2)}px`,
                          background: `linear-gradient(90deg, ${colors.text} 0%, transparent 100%)`,
                          marginBottom: `${s(10)}px`,
                          display: 'flex',
                        },
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          fontSize: `${s(18)}px`,
                          color: '#ffffff',
                          lineHeight: 1.5,
                          letterSpacing: '-0.01em',
                          fontWeight: 600,
                        },
                        children: context,
                      },
                    },
                  ],
                },
              },
              // Footer
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    paddingTop: `${s(14)}px`,
                    borderTop: `${s(1)}px solid ${colors.border.replace('0.4', '0.25')}`,
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: `${s(5)}px`,
                        },
                        children: [
                          {
                            type: 'span',
                            props: {
                              style: { display: 'flex', fontSize: `${s(10)}px`, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
                              children: 'powered by',
                            },
                          },
                          {
                            type: 'span',
                            props: {
                              style: { display: 'flex', fontSize: `${s(13)}px`, fontWeight: 'bold', color: '#ffd700' },
                              children: '$WRAPPED',
                            },
                          },
                          {
                            type: 'span',
                            props: {
                              style: { display: 'flex', fontSize: `${s(10)}px`, color: '#9ca3af', marginLeft: `${s(4)}px` },
                              children: 'walletwrapped.io',
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };

  // Generate SVG using Satori
  const fonts = [];
  if (interRegular) {
    fonts.push({ name: 'Inter', data: interRegular, weight: 400, style: 'normal' });
  }
  if (interBold) {
    fonts.push({ name: 'Inter', data: interBold, weight: 700, style: 'normal' });
  }

  const svg = await satori(jsx, {
    width: 800,
    height: 1040,
    fonts: fonts.length > 0 ? fonts : undefined,
  });

  // Convert SVG to PNG using Resvg
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 800 },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return pngBuffer;
}

/**
 * Generate summary card with all highlights
 * @param {Array} highlights - All highlights for the wallet
 * @param {string} walletAddress - Wallet address
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateSummaryCard(highlights, walletAddress) {
  // Load satori (ES module with dynamic import)
  await loadSatori();
  if (!satori) {
    throw new Error('Satori not available - cannot generate summary card');
  }

  const fontsLoaded = await loadFonts();
  if (!fontsLoaded) {
    throw new Error('Fonts not available - cannot generate summary card');
  }

  // Build summary items
  const summaryItems = highlights.map(h => ({
    title: h.title || '',
    value: h.metadata?.formattedPrimary || h.value_primary || '',
    isProfit: h.metadata?.isProfit,
  }));

  const jsx = {
    type: 'div',
    props: {
      style: {
        width: '800px',
        height: '1040px',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #0a0a1a 100%)',
        fontFamily: 'Inter',
        padding: '48px',
      },
      children: [
        // Header
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '40px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '48px',
                    fontWeight: '700',
                    color: '#ffffff',
                  },
                  children: '2025 Wrapped',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '32px',
                    fontWeight: '900',
                    color: '#a855f7',
                  },
                  children: 'SUMMARY',
                },
              },
            ],
          },
        },
        // Summary items
        ...summaryItems.map(item => ({
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '24px 32px',
              marginBottom: '16px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '16px',
              border: '2px solid rgba(139, 92, 246, 0.3)',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '28px',
                    color: '#ffffff',
                    fontWeight: '600',
                  },
                  children: item.title,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '32px',
                    fontWeight: '700',
                    color: item.isProfit === true ? '#22c55e' :
                           item.isProfit === false ? '#ef4444' : '#a855f7',
                  },
                  children: item.value,
                },
              },
            ],
          },
        })),
        // Footer
        {
          type: 'div',
          props: {
            style: {
              marginTop: 'auto',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '24px',
              borderTop: '2px solid rgba(139, 92, 246, 0.25)',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '20px',
                    color: '#9ca3af',
                    fontFamily: 'monospace',
                  },
                  children: `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  },
                  children: [
                    {
                      type: 'span',
                      props: {
                        style: { fontSize: '18px', color: '#9ca3af' },
                        children: 'powered by',
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: { fontSize: '22px', fontWeight: 'bold', color: '#ffd700' },
                        children: '$WRAPPED',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };

  const fonts = [];
  if (interRegular) {
    fonts.push({ name: 'Inter', data: interRegular, weight: 400, style: 'normal' });
  }
  if (interBold) {
    fonts.push({ name: 'Inter', data: interBold, weight: 700, style: 'normal' });
  }

  const svg = await satori(jsx, {
    width: 800,
    height: 1040,
    fonts: fonts.length > 0 ? fonts : undefined,
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 800 },
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

/**
 * Ensure satori and fonts are loaded before card generation
 * Call this once before generating multiple cards in parallel
 * @returns {Promise<{ready: boolean, error?: string}>}
 */
async function ensureReady() {
  try {
    const [satoriResult, fontsResult] = await Promise.all([
      loadSatori(),
      loadFonts()
    ]);

    const satoriOk = !!satori;
    const fontsOk = !!fontsResult;

    if (!satoriOk || !fontsOk) {
      const missing = [];
      if (!satoriOk) missing.push('satori');
      if (!fontsOk) missing.push('fonts');
      return { ready: false, error: `Missing: ${missing.join(', ')}` };
    }

    return { ready: true };
  } catch (err) {
    return { ready: false, error: err.message };
  }
}

/**
 * Check if card generator is ready (non-blocking)
 */
function isReady() {
  return !!(satori && interRegular && interBold);
}

// Pre-load satori and fonts on module load with detailed logging
Promise.all([
  loadSatori(),
  loadFonts()
]).then(([satoriResult, fontsSuccess]) => {
  const satoriOk = !!satori;
  console.log(`[CardGen] Module initialized - satori: ${satoriOk ? 'ready' : 'FAILED'}, fonts: ${fontsSuccess ? 'ready' : 'FAILED'}`);
  if (!satoriOk || !fontsSuccess) {
    console.error('[CardGen] WARNING: Card generation may fail due to missing dependencies');
  }
}).catch(err => {
  console.error('[CardGen] Module initialization error:', err);
});

module.exports = {
  generateCard,
  generateSummaryCard,
  loadFonts,
  loadSatori,
  ensureReady,
  isReady,
};

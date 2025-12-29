const satori = require('satori');
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

/**
 * Server-side Card Image Generator
 * Uses Satori + Resvg to generate PNG cards without requiring a separate client deployment
 */

// Cache font data
let interRegular = null;
let interBold = null;
let fontLoadAttempted = false;
let fontLoadPromise = null;

// Load fonts with retry logic
async function loadFonts() {
  // Return cached fonts if already loaded
  if (interRegular && interBold) return true;

  // If already loading, wait for that promise
  if (fontLoadPromise) {
    await fontLoadPromise;
    return !!(interRegular && interBold);
  }

  // Fetch font from Google Fonts API
  const fetchFont = async (weight, retries = 3) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const API = `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&display=swap`;
        const css = await (await fetch(API, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          }
        })).text();

        const match = css.match(/src: url\((.+)\) format\('(opentype|truetype)'\)/);
        if (match) {
          const fontUrl = match[1];
          const response = await fetch(fontUrl);
          if (!response.ok) throw new Error(`Font fetch failed: ${response.status}`);
          const buffer = Buffer.from(await response.arrayBuffer());
          console.log(`[CardGen] Font weight ${weight} loaded (${buffer.length} bytes)`);
          return buffer;
        }
        throw new Error('Could not parse font URL from CSS');
      } catch (error) {
        console.error(`[CardGen] Font ${weight} attempt ${attempt}/${retries} failed:`, error.message);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * attempt)); // Exponential backoff
        }
      }
    }
    return null;
  };

  fontLoadPromise = (async () => {
    try {
      console.log('[CardGen] Loading fonts from Google Fonts...');
      const [regular, bold] = await Promise.all([
        fetchFont(400),
        fetchFont(700)
      ]);

      if (regular && bold) {
        interRegular = regular;
        interBold = bold;
        console.log('[CardGen] All fonts loaded successfully');
        return true;
      } else {
        console.error('[CardGen] Some fonts failed to load - regular:', !!regular, 'bold:', !!bold);
        return false;
      }
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
 * @param {Object} highlight - Highlight data from database
 * @param {string} walletAddress - Wallet address for display
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateCard(highlight, walletAddress) {
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
  const tokenSymbol = highlight.metadata?.tokenSymbol;

  // Calculate font size based on value length
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

  // Determine value color
  const isPositive = typeof value === 'string' && (value.startsWith('+') || (!value.startsWith('-') && value.includes('$')));
  const isNegative = typeof value === 'string' && value.startsWith('-');
  const valueColor = isPositive ? '#22c55e' : isNegative ? '#ef4444' : colors.text;

  // Show ticker for certain highlight types
  const showTicker = ['biggest_win', 'biggest_loss', 'longest_hold'].includes(highlight.highlight_type) && tokenSymbol;

  // Build JSX-like structure for Satori
  const jsx = {
    type: 'div',
    props: {
      style: {
        width: '800px',
        height: '1040px',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #0a0a1a 100%)',
        position: 'relative',
        fontFamily: 'Inter',
        overflow: 'hidden',
      },
      children: [
        // Main content container
        {
          type: 'div',
          props: {
            style: {
              position: 'relative',
              width: '100%',
              height: '100%',
              border: `4px solid ${colors.border}`,
              borderRadius: '32px',
              padding: '56px',
              display: 'flex',
              flexDirection: 'column',
            },
            children: [
              // Header
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '48px',
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
                                fontSize: '22px',
                                color: colors.text,
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em',
                                marginBottom: '12px',
                                fontWeight: '600',
                              },
                              children: '2025 WRAPPED',
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: '56px',
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
                                fontSize: '48px',
                                fontWeight: '900',
                                color: '#a855f7',
                                lineHeight: 1,
                              },
                              children: '2025',
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
              // Token ticker (if applicable)
              ...(showTicker ? [{
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '20px',
                    marginBottom: '32px',
                    padding: '24px 32px',
                    background: `linear-gradient(135deg, ${colors.text}15 0%, ${colors.text}08 100%)`,
                    borderRadius: '24px',
                    border: `2px solid ${colors.text}30`,
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '56px',
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
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: `${valueFontSize * 2}px`,
                          fontWeight: 900,
                          color: valueColor,
                          lineHeight: 0.9,
                          letterSpacing: '-0.06em',
                          maxWidth: '680px',
                        },
                        children: value,
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '44px',
                          color: colors.text,
                          marginTop: '32px',
                          fontWeight: 600,
                          fontStyle: 'italic',
                        },
                        children: subtitle,
                      },
                    },
                  ],
                },
              },
              // Context
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    marginBottom: '36px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: '120px',
                          height: '4px',
                          background: `linear-gradient(90deg, ${colors.text} 0%, transparent 100%)`,
                          marginBottom: '20px',
                        },
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '36px',
                          color: '#ffffff',
                          lineHeight: 1.5,
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
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '28px',
                    borderTop: `2px solid ${colors.border.replace('0.4', '0.25')}`,
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '24px',
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
                          gap: '10px',
                        },
                        children: [
                          {
                            type: 'span',
                            props: {
                              style: { fontSize: '20px', color: '#9ca3af' },
                              children: 'powered by',
                            },
                          },
                          {
                            type: 'span',
                            props: {
                              style: {
                                fontSize: '26px',
                                fontWeight: 'bold',
                                color: '#ffd700',
                              },
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

// Pre-load fonts on module load with detailed logging
loadFonts().then(success => {
  if (success) {
    console.log('[CardGen] Module initialized - fonts ready for card generation');
  } else {
    console.error('[CardGen] Module initialized - WARNING: fonts failed to load, card generation will fail');
  }
}).catch(err => {
  console.error('[CardGen] Module initialization error:', err);
});

module.exports = {
  generateCard,
  generateSummaryCard,
  loadFonts,
};

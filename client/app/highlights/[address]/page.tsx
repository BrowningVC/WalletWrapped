'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import WalletCounter from '@/components/WalletCounter';
import Fireworks from '@/components/Fireworks';

// Format number with commas (e.g., 352898 -> 352,898)
function formatNumberWithCommas(num: number): string {
  // Handle decimals properly
  const parts = num.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

// SVG Icon Components
const Icons = {
  // Highlight icons
  wallet: () => (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <circle cx="17" cy="14" r="2" fill="currentColor" />
      <path d="M6 6V4a2 2 0 012-2h8a2 2 0 012 2v2" />
    </svg>
  ),
  rocket: () => (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2L8 8l-4 2 2 4-2 4 6 2 2 2 2-2 6-2-2-4 2-4-4-2-4-6z" fill="currentColor" opacity="0.2" />
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  ),
  trendDown: () => (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 3v18h18" />
      <path d="M21 17l-6-6-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 17h-4v-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  trophy: () => (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 9H4a2 2 0 01-2-2V5a2 2 0 012-2h2M18 9h2a2 2 0 002-2V5a2 2 0 00-2-2h-2" />
      <path d="M6 3h12v7a6 6 0 11-12 0V3z" fill="currentColor" opacity="0.2" />
      <path d="M6 3h12v7a6 6 0 11-12 0V3z" />
      <path d="M12 16v3M8 22h8M10 19h4" />
    </svg>
  ),
  diamond: () => (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 3h12l4 6-10 13L2 9l4-6z" fill="currentColor" opacity="0.2" />
      <path d="M6 3h12l4 6-10 13L2 9l4-6z" />
      <path d="M2 9h20M12 22L6 9l6-6 6 6-6 13" />
    </svg>
  ),
  sparkles: () => (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" fill="currentColor" opacity="0.2" />
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M5 19l.5 1.5L7 21l-1.5.5L5 23l-.5-1.5L3 21l1.5-.5L5 19zM19 13l.5 1.5L21 15l-1.5.5L19 17l-.5-1.5L17 15l1.5-.5L19 13z" />
    </svg>
  ),
  // UI icons
  firework: () => (
    <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
    </svg>
  ),
  chart: () => (
    <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 17v-4M12 17V9M17 17v-6" strokeLinecap="round" />
    </svg>
  ),
  star: () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z" />
    </svg>
  ),
};

// Get icon component by highlight type
const getHighlightIcon = (type: string): React.FC => {
  const iconMap: Record<string, React.FC> = {
    overall_pnl: Icons.wallet,
    biggest_win: Icons.rocket,
    biggest_loss: Icons.trendDown,
    win_rate: Icons.trophy,
    longest_hold: Icons.diamond,
    best_profit_day: Icons.sparkles,
  };
  return iconMap[type] || Icons.sparkles;
};


interface HighlightMetadata {
  tokenSymbol?: string;
  tokenMint?: string;
  tradesCount?: number;
  profitPercent?: number;
  lossPercent?: number;
  holdingDays?: number;
  month?: string;
  monthPNL?: number;
  isProfit?: boolean;
  noData?: boolean;
  profitablePositions?: number;
  closedPositions?: number;
}

interface ServerHighlight {
  type: string;
  title: string;
  description: string;
  valuePrimary: string | number;
  valueSecondary: string | number;
  metadata: HighlightMetadata;
  rank: number;
  imageUrl?: string;
}

interface Highlight {
  id: string;
  type: string;
  title: string;
  value: string;
  subtitle: string;
  context: string;
  colorScheme: 'profit' | 'loss' | 'neutral';
  rank: number;
  tokenTicker?: string;
}

interface WalletSummary {
  walletAddress: string;
  totalRealizedPNL: number;
  totalUnrealizedPNL: number;
  totalPNL: number;
  transactionCount: number;
  activePositions: number;
  closedPositions: number;
  winRate: number;
}

interface AnalysisData {
  summary: WalletSummary;
  highlights: Highlight[];
}

// Map server highlight types to display properties
const highlightConfig: Record<string, { colorScheme: 'profit' | 'loss' | 'neutral' }> = {
  overall_pnl: { colorScheme: 'neutral' },
  biggest_win: { colorScheme: 'profit' },
  biggest_loss: { colorScheme: 'loss' },
  win_rate: { colorScheme: 'neutral' },
  longest_hold: { colorScheme: 'neutral' },
  best_profit_day: { colorScheme: 'profit' },
};

function transformHighlight(serverHighlight: ServerHighlight): Highlight {
  const config = highlightConfig[serverHighlight.type] || { colorScheme: 'neutral' as const };

  let colorScheme = config.colorScheme;
  if (serverHighlight.type === 'overall_pnl') {
    const numValue = typeof serverHighlight.valuePrimary === 'string'
      ? parseFloat(serverHighlight.valuePrimary.replace(/[^0-9.-]/g, ''))
      : serverHighlight.valuePrimary;
    colorScheme = numValue >= 0 ? 'profit' : 'loss';
  }

  const tokenTicker = serverHighlight.metadata?.tokenSymbol || undefined;

  // Format values with appropriate units based on highlight type
  let value = String(serverHighlight.valuePrimary);
  let subtitle = String(serverHighlight.valueSecondary || '');

  // Add units to values for better UX
  switch (serverHighlight.type) {
    case 'overall_pnl':
    case 'biggest_win':
    case 'biggest_loss':
    case 'best_profit_day':
      // Financial values: Primary is USD, Secondary is SOL
      if (!value.includes('$')) {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
          value = '$0';
        } else {
          value = numValue >= 0 ? `+$${formatNumberWithCommas(Math.abs(numValue))}` : `-$${formatNumberWithCommas(Math.abs(numValue))}`;
        }
      }
      if (subtitle && !subtitle.includes('SOL') && !subtitle.includes('(')) {
        const numSol = parseFloat(subtitle);
        if (isNaN(numSol)) {
          subtitle = '0 SOL';
        } else {
          subtitle = numSol >= 0 ? `+${formatNumberWithCommas(Math.abs(numSol))} SOL` : `-${formatNumberWithCommas(Math.abs(numSol))} SOL`;
        }
      }
      // Also format values that already have $ sign but no commas
      if (value.includes('$') && !value.includes(',')) {
        const numMatch = value.match(/[+-]?\$?([\d.]+)/);
        if (numMatch) {
          const numValue = parseFloat(numMatch[1]);
          const sign = value.startsWith('-') ? '-' : '+';
          value = `${sign}$${formatNumberWithCommas(numValue)}`;
        }
      }
      break;

    case 'win_rate':
      // Win rate: Primary is percentage, Secondary is wins count
      if (!value.includes('%')) {
        value = `${value}%`;
      }
      if (subtitle && serverHighlight.metadata) {
        const profitablePos = serverHighlight.metadata.profitablePositions || 0;
        const closedPos = serverHighlight.metadata.closedPositions || 0;
        subtitle = `${profitablePos}/${closedPos} wins`;
      }
      break;

    case 'longest_hold':
      // Longest hold: Primary is days, Secondary is token symbol
      if (!value.includes('day')) {
        const numDays = parseFloat(value);
        if (isNaN(numDays) || numDays === 0) {
          value = '0 days';
        } else {
          value = numDays === 1 ? '1 day' : `${numDays} days`;
        }
      }
      // Subtitle is already the token symbol from metadata
      break;
  }

  const context = serverHighlight.description;

  return {
    id: `${serverHighlight.type}-${serverHighlight.rank}`,
    type: serverHighlight.type,
    title: serverHighlight.title,
    value,
    subtitle,
    context,
    colorScheme,
    rank: serverHighlight.rank,
    tokenTicker,
  };
}

// Firework-themed decorative background (no animations for clean image copying)
function FireworkDecorations() {
  return (
    <>
      {/* Subtle sparkle particles */}
      <div className="absolute top-10 right-10 w-2 h-2 rounded-full bg-festive-gold/60" />
      <div className="absolute top-20 right-20 w-1.5 h-1.5 rounded-full bg-festive-pink/50" />
      <div className="absolute bottom-20 left-10 w-2 h-2 rounded-full bg-primary-400/60" />
      <div className="absolute bottom-32 left-20 w-1.5 h-1.5 rounded-full bg-festive-gold/50" />

      {/* Corner accent lines */}
      <div className="absolute top-0 right-0 w-16 h-16">
        <div className="absolute top-4 right-4 w-12 h-px bg-gradient-to-l from-primary-500/40 to-transparent" />
        <div className="absolute top-4 right-4 w-px h-12 bg-gradient-to-t from-primary-500/40 to-transparent" />
      </div>
    </>
  );
}

// PNL Card Component - firework theme
function PNLCard({ highlight, walletAddress }: { highlight: Highlight; walletAddress: string }) {
  const isProfit = highlight.colorScheme === 'profit';
  const isLoss = highlight.colorScheme === 'loss';

  const cardClass = isProfit
    ? 'pnl-card pnl-card-profit'
    : isLoss
      ? 'pnl-card pnl-card-loss'
      : 'pnl-card pnl-card-neutral';

  // Firework theme styles
  const styles = {
    valueClass: isProfit ? 'text-green-400' : isLoss ? 'text-red-400' : 'text-primary-400',
    subtitleClass: 'text-gray-300',
    accentClass: 'text-primary-400',
    labelClass: 'text-gray-400',
    contextClass: 'text-gray-400/80',
    borderClass: 'border-primary-400/30',
  };

  // Calculate font size based on value length (explicit values for html2canvas)
  const getValueFontSize = () => {
    const len = highlight.value.length;
    if (len > 20) return '1.75rem';
    if (len > 15) return '2rem';
    if (len > 12) return '2.5rem';
    if (len > 8) return '3rem';
    return '3.5rem';
  };

  return (
    <div className={cardClass} style={{ width: '400px', height: '520px', position: 'relative', outline: 'none', border: 'none' }}>
      {/* Firework decorations */}
      <FireworkDecorations />

      {/* Content - using absolute positioning for consistent rendering */}
      <div style={{ position: 'relative', zIndex: 10, padding: '24px', height: '100%', border: 'none', outline: 'none' }}>
        {/* Top section - Title & Year */}
        <div style={{ position: 'absolute', top: '24px', left: '24px', right: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className={`text-sm uppercase tracking-wider mb-1 ${styles.labelClass}`} style={{ marginBottom: '4px' }}>
              {highlight.type === 'overall_pnl' ? '2025 WRAPPED' : highlight.type.replace(/_/g, ' ').toUpperCase()}
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
              <span className={styles.valueClass}>
                {(() => {
                  const IconComponent = getHighlightIcon(highlight.type);
                  return <IconComponent />;
                })()}
              </span>
              {highlight.title}
            </h2>
          </div>
          <div className={styles.accentClass} style={{ fontSize: '20px', fontWeight: 'bold' }}>
            2025
          </div>
        </div>

        {/* Token ticker if applicable */}
        {highlight.tokenTicker && (
          <div style={{ position: 'absolute', top: '100px', left: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold',
              backgroundColor: isProfit ? '#22c55e' : isLoss ? '#ec4899' : '#a855f7',
              color: 'white'
            }}>
              {highlight.tokenTicker.charAt(0)}
            </div>
            <span style={{ fontSize: '20px', fontWeight: '600', color: 'white' }}>
              ${highlight.tokenTicker}
            </span>
          </div>
        )}

        {/* Main value - Large and prominent - centered vertically */}
        <div style={{ position: 'absolute', top: '50%', left: '24px', right: '24px', transform: 'translateY(-50%)' }}>
          <div
            className={`font-black ${styles.valueClass}`}
            style={{
              textShadow: '0 0 30px currentColor',
              fontSize: getValueFontSize(),
              lineHeight: '1.1',
              wordBreak: 'break-word',
              fontWeight: '900'
            }}
          >
            {highlight.value}
          </div>
          <div className={styles.subtitleClass} style={{ fontSize: '18px', marginTop: '8px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {highlight.subtitle}
          </div>
        </div>

        {/* Bottom section - Context & Branding */}
        <div style={{ position: 'absolute', bottom: '24px', left: '24px', right: '24px' }}>
          <p className={styles.contextClass} style={{
            fontSize: '18px',
            marginBottom: '16px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: '2',
            WebkitBoxOrient: 'vertical',
            lineHeight: '1.4'
          }}>
            {highlight.context}
          </p>

          {/* Branding footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '16px',
            borderTop: `1px solid ${isProfit ? 'rgba(34, 197, 94, 0.3)' : isLoss ? 'rgba(239, 68, 68, 0.3)' : 'rgba(139, 92, 246, 0.3)'}`
          }}>
            <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#9ca3af', maxWidth: '50%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>powered by</span>
              <span className={styles.accentClass} style={{ fontWeight: 'bold', fontSize: '14px' }}>$WRAPPED</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HighlightsPage() {
  const params = useParams();
  const router = useRouter();
  const address = params.address as string;

  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentCard, setCurrentCard] = useState(0);
  const [imageLoading, setImageLoading] = useState(true); // Track card image loading state
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'success' | 'error'>('idle');
  const [revealedCards, setRevealedCards] = useState<Set<number>>(new Set([0])); // Track which cards have been revealed (start with first card revealed)
  const [sparklingCard, setSparklingCard] = useState<number | null>(null); // Track which card is currently sparkling
  const cardRef = useRef<HTMLDivElement>(null);
  const preloadedImages = useRef<Set<number>>(new Set()); // Track which images are preloaded

  useEffect(() => {
    if (!address) return;

    const abortController = new AbortController();
    let retryTimeout: NodeJS.Timeout | null = null;

    const fetchHighlights = async (retryCount = 0) => {
      const maxRetries = 3;
      const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Exponential backoff, max 5s

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

        const [summaryRes, highlightsRes] = await Promise.all([
          fetch(`${apiUrl}/api/wallet/${address}/summary`, { signal: abortController.signal }),
          fetch(`${apiUrl}/api/wallet/${address}/highlights`, { signal: abortController.signal })
        ]);

        if (!summaryRes.ok || !highlightsRes.ok) {
          throw new Error('Failed to fetch wallet data');
        }

        const [summaryData, highlightsData] = await Promise.all([
          summaryRes.json(),
          highlightsRes.json()
        ]);

        // Don't update state if aborted
        if (abortController.signal.aborted) return;

        const transformedHighlights = (highlightsData as ServerHighlight[]).map(transformHighlight);

        // Reorder highlights: move overall_pnl to the end (6th position)
        const reorderedHighlights = [
          ...transformedHighlights.filter(h => h.type !== 'overall_pnl'),
          ...transformedHighlights.filter(h => h.type === 'overall_pnl'),
        ];

        setData({
          summary: {
            walletAddress: address,
            totalRealizedPNL: summaryData.totalRealizedPNL || 0,
            totalUnrealizedPNL: summaryData.totalUnrealizedPNL || 0,
            totalPNL: summaryData.totalPNL || 0,
            transactionCount: summaryData.transactionCount || 0,
            activePositions: summaryData.activePositions || 0,
            closedPositions: summaryData.closedPositions || 0,
            winRate: summaryData.winRate || 0,
          },
          highlights: reorderedHighlights,
        });
        setLoading(false);
      } catch (err: any) {
        // Ignore abort errors
        if (err.name === 'AbortError') return;

        console.error(`Failed to fetch highlights (attempt ${retryCount + 1}):`, err);

        // Retry if we haven't exceeded max retries
        if (retryCount < maxRetries && !abortController.signal.aborted) {
          console.log(`Retrying in ${retryDelay}ms...`);
          retryTimeout = setTimeout(() => fetchHighlights(retryCount + 1), retryDelay);
        } else if (!abortController.signal.aborted) {
          setError(err.message || 'Failed to load highlights');
          setLoading(false);
        }
      }
    };

    fetchHighlights();

    return () => {
      abortController.abort();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [address]);

  const formatPNL = (value: number) => {
    const formatted = Math.abs(value).toFixed(2);
    const prefix = value >= 0 ? '+' : '-';
    return `${prefix}${formatted} SOL`;
  };

  // Reveal a card and trigger sparkle effect
  const revealCard = (idx: number) => {
    if (!revealedCards.has(idx)) {
      setRevealedCards(prev => new Set([...prev, idx]));
      setSparklingCard(idx);
      // Clear sparkle after animation completes
      setTimeout(() => setSparklingCard(null), 600);
    }
  };

  // Preload adjacent card images for faster navigation
  const preloadCard = (idx: number) => {
    if (idx < 0 || !data || idx >= data.highlights.length) return;
    if (preloadedImages.current.has(idx)) return;

    const img = new Image();
    img.onload = () => {
      // Successfully preloaded
      preloadedImages.current.add(idx);
    };
    img.onerror = () => {
      // Remove from set so it can be retried on next navigation
      preloadedImages.current.delete(idx);
      console.warn(`Failed to preload card ${idx}, will retry on next access`);
    };
    // Mark as loading to prevent duplicate requests
    preloadedImages.current.add(idx);
    img.src = `/api/card/${address}/${idx}`;
  };

  // Preload card 0 immediately on mount (before data loads) for fastest first card
  // The analyze page already starts this preload, but this ensures it's requested early
  useEffect(() => {
    if (!address) return;
    // Preload first card immediately - even before highlights data is ready
    preloadCard(0);
  }, [address]);

  // Preload remaining cards in staggered batches after data loads
  useEffect(() => {
    if (!data) return;

    // Card 0 already preloaded above, start with card 1 immediately
    preloadCard(1);

    // Batch 2: Load cards 2-3 after 300ms (reduced from 500ms)
    const batch2 = setTimeout(() => {
      preloadCard(2);
      preloadCard(3);
    }, 300);

    // Batch 3: Load cards 4-5 after 600ms (reduced from 1s)
    const batch3 = setTimeout(() => {
      preloadCard(4);
      preloadCard(5);
    }, 600);

    return () => {
      clearTimeout(batch2);
      clearTimeout(batch3);
    };
  }, [data, address]);

  // Preload next/prev cards when current card changes (backup for edge cases)
  useEffect(() => {
    if (!data) return;
    // Preload adjacent cards
    preloadCard(currentCard + 1);
    preloadCard(currentCard - 1);
  }, [currentCard, data, address]);

  const nextCard = () => {
    if (data && currentCard < data.highlights.length - 1) {
      const nextIdx = currentCard + 1;
      setImageLoading(true);
      setCurrentCard(nextIdx);
      revealCard(nextIdx);
    }
  };

  const prevCard = () => {
    if (currentCard > 0) {
      setImageLoading(true);
      setCurrentCard(currentCard - 1);
      // Previous cards should already be revealed, but ensure it
      revealCard(currentCard - 1);
    }
  };

  // Handle direct card selection
  const selectCard = (idx: number) => {
    setImageLoading(true);
    setCurrentCard(idx);
    revealCard(idx);
  };

  // Copy card as image to clipboard
  const copyCardToClipboard = async () => {
    if (!cardRef.current) return;

    setCopyStatus('copying');
    try {
      // Fetch the pre-rendered PNG from the server
      const imageUrl = `/api/card/${address}/${currentCard}`;
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      // Create a new blob with explicit PNG type (required for clipboard API)
      const pngBlob = new Blob([blob], { type: 'image/png' });

      // Try direct clipboard write first
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': pngBlob })
        ]);
        setCopyStatus('success');
        setTimeout(() => setCopyStatus('idle'), 2000);
        return;
      } catch (clipboardError) {
        console.log('Direct clipboard write failed, trying canvas approach:', clipboardError);
      }

      // Canvas approach: load image, draw to canvas, get fresh blob
      const img = new Image();
      const objectUrl = URL.createObjectURL(pngBlob);

      await new Promise<void>((resolve, reject) => {
        img.onload = async () => {
          URL.revokeObjectURL(objectUrl);

          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0);

          canvas.toBlob(async (canvasBlob) => {
            if (!canvasBlob) {
              reject(new Error('Could not create blob from canvas'));
              return;
            }

            try {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': canvasBlob })
              ]);
              setCopyStatus('success');
              setTimeout(() => setCopyStatus('idle'), 2000);
              resolve();
            } catch (err) {
              console.error('Canvas clipboard write also failed:', err);
              reject(new Error('Clipboard write failed'));
            }
          }, 'image/png');
        };

        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Failed to load image'));
        };

        img.src = objectUrl;
      });
    } catch (error) {
      console.error('Failed to copy image:', error);
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  // Share to X: Copy image to clipboard, then open X with pre-filled text
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing' | 'success' | 'error'>('idle');
  const [tokenCopied, setTokenCopied] = useState(false);

  // Token contract address - same as main page
  const tokenContract = 'COMING_SOON';

  const copyTokenContract = async () => {
    if (tokenContract === 'COMING_SOON') return;

    try {
      await navigator.clipboard.writeText(tokenContract);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy token address:', err);
    }
  };

  const shareToX = async () => {
    if (!data) return;

    setShareStatus('sharing');

    // Build combined summary of all highlights
    const highlights = data.highlights;
    // Remove decimal points from dollar values for cleaner tweet text
    const summaryLines = highlights.map(h => {
      let value = h.value;
      if (value.includes('$')) {
        value = value.replace(/(\$[\d,]+)\.\d+/, '$1');
      }
      return `${h.title}: ${value}`;
    }).join('\n');
    const shareText = `My 2025 in the Trenches Wrapped:

${summaryLines}`;

    try {
      // Copy the summary card image to clipboard (all highlights in one)
      const imageUrl = `/api/card/${address}/summary`;
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const pngBlob = new Blob([blob], { type: 'image/png' });

      let imageCopied = false;

      // Try direct clipboard write
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': pngBlob })
        ]);
        imageCopied = true;
      } catch {
        // Try canvas approach as fallback
        try {
          const img = new Image();
          const objectUrl = URL.createObjectURL(pngBlob);

          await new Promise<void>((resolve, reject) => {
            img.onload = async () => {
              URL.revokeObjectURL(objectUrl);
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (!ctx) { reject(new Error('No canvas context')); return; }
              ctx.drawImage(img, 0, 0);

              canvas.toBlob(async (canvasBlob) => {
                if (!canvasBlob) { reject(new Error('No blob')); return; }
                try {
                  await navigator.clipboard.write([new ClipboardItem({ 'image/png': canvasBlob })]);
                  imageCopied = true;
                  resolve();
                } catch { reject(new Error('Clipboard failed')); }
              }, 'image/png');
            };
            img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')); };
            img.src = objectUrl;
          });
        } catch {
          // Image copy failed, continue without it
        }
      }

      // Open X with pre-filled tweet
      const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
      // Use window features only on desktop (mobile browsers ignore them anyway)
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        window.open(tweetUrl, '_blank');
      } else {
        window.open(tweetUrl, '_blank', 'width=550,height=420');
      }

      // Only show success toast if image was copied
      if (imageCopied) {
        setShareStatus('success');
        setTimeout(() => setShareStatus('idle'), 3000);
      } else {
        setShareStatus('idle');
      }

    } catch (error) {
      console.error('Share to X failed:', error);
      // Still open X even if clipboard failed
      const fallbackText = `My 2025 in the Trenches Wrapped:\n\n${highlights.map(h => `${h.title}: ${h.value}`).join('\n')}`;
      const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(fallbackText)}`;
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        window.open(tweetUrl, '_blank');
      } else {
        window.open(tweetUrl, '_blank', 'width=550,height=420');
      }
      setShareStatus('idle');
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextCard();
      if (e.key === 'ArrowLeft') prevCard();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentCard, data]);

  // Mobile swipe gesture support
  useEffect(() => {
    const cardElement = cardRef.current;
    if (!cardElement) return;

    let touchStartX = 0;
    let touchEndX = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.changedTouches[0].screenX;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    };

    const handleSwipe = () => {
      const swipeThreshold = 50; // Minimum distance for swipe (px)
      const diff = touchStartX - touchEndX;

      if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
          // Swiped left -> next card
          nextCard();
        } else {
          // Swiped right -> previous card
          prevCard();
        }
      }
    };

    cardElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    cardElement.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      cardElement.removeEventListener('touchstart', handleTouchStart);
      cardElement.removeEventListener('touchend', handleTouchEnd);
    };
  }, [currentCard, data]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-dark-950 relative overflow-hidden">
        <Fireworks />
        <div className="absolute inset-0 bg-gradient-radial from-dark-800/30 via-dark-950 to-dark-950" />
        <div className="text-center relative z-10">
          <div className="text-festive-gold mb-6 animate-bounce flex justify-center">
            <Icons.firework />
          </div>
          <div className="spinner w-16 h-16 mx-auto mb-4"></div>
          <p className="text-gray-400">Unwrapping your 2025...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-dark-950 relative overflow-hidden">
        <Fireworks />
        <div className="absolute inset-0 bg-gradient-radial from-dark-800/30 via-dark-950 to-dark-950" />
        <div className="max-w-md w-full relative z-10">
          <div className="card border-loss-500">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-loss-500/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-loss-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2 text-white">Error Loading Highlights</h2>
              <p className="text-gray-400 mb-6">{error}</p>
              <Link href="/" className="btn-primary">
                Try Another Wallet
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!data || data.highlights.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-dark-950 relative overflow-hidden">
        <Fireworks />
        <div className="absolute inset-0 bg-gradient-radial from-dark-800/30 via-dark-950 to-dark-950" />
        <div className="max-w-md w-full relative z-10">
          <div className="card">
            <div className="text-center">
              <div className="text-gray-500 mb-4 flex justify-center">
                <Icons.chart />
              </div>
              <h2 className="text-2xl font-bold mb-2 text-white">No Highlights Found</h2>
              <p className="text-gray-400 mb-6">
                This wallet doesn't have enough trading activity to generate highlights.
              </p>
              <Link href="/" className="btn-primary">
                Try Another Wallet
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const highlight = data.highlights[currentCard];

  return (
    <main className="min-h-screen py-8 px-4 bg-dark-950 relative overflow-hidden">
      {/* Fireworks background effect */}
      <Fireworks />

      {/* Dark gradient background */}
      <div className="absolute inset-0 bg-gradient-radial from-dark-800/30 via-dark-950 to-dark-950" />

      {/* Toast Notification */}
      {copyStatus === 'success' && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
          <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-green-500 text-white font-medium shadow-lg shadow-green-500/30">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Image copied to clipboard!
          </div>
        </div>
      )}
      {copyStatus === 'error' && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
          <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-red-500 text-white font-medium shadow-lg shadow-red-500/30">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Failed to copy image
          </div>
        </div>
      )}
      {shareStatus === 'success' && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down max-w-[90vw]">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 px-4 sm:px-5 py-3 rounded-xl bg-black text-white font-medium shadow-lg border border-gray-700">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              <span className="text-sm sm:text-base">Image copied!</span>
            </div>
            <span className="text-xs sm:text-sm text-gray-400">Paste in the next screen</span>
          </div>
        </div>
      )}

      {/* Subtle ambient glow orbs - matching landing page */}
      <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-festive-gold/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-20 right-1/4 w-[400px] h-[400px] bg-festive-pink/5 rounded-full blur-[100px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/5 rounded-full blur-[120px]" />

      <div className="max-w-lg mx-auto relative z-10">
        {/* Header with logo and counter */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo size="small" />
          </Link>
          <WalletCounter variant="compact" showActive={true} />
        </div>

        {/* Page Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">
            <span className="text-white">Your </span>
            <span className="festive-gradient-text">2025 Wrapped</span>
          </h1>
          <div className="flex items-center justify-center gap-2">
            <span className="text-gray-400 text-sm">Powered by</span>
            <span className="text-sm font-bold bg-gradient-to-r from-festive-gold via-festive-pink to-festive-purple bg-clip-text text-transparent">$WRAPPED</span>
            <button
              onClick={copyTokenContract}
              disabled={tokenContract === 'COMING_SOON'}
              className={`p-1 rounded transition-all duration-200 ${
                tokenContract === 'COMING_SOON'
                  ? 'text-gray-600 cursor-not-allowed'
                  : tokenCopied
                    ? 'text-green-400'
                    : 'text-gray-400 hover:text-festive-gold'
              }`}
              title={tokenContract === 'COMING_SOON' ? 'Token address coming soon' : 'Copy token address'}
            >
              {tokenCopied ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Card Counter */}
        <div className="text-center mb-4">
          <span className="text-festive-gold font-bold">{currentCard + 1}</span>
          <span className="text-gray-500"> / {data.highlights.length}</span>
        </div>

        {/* PNL Card - Server-generated PNG with Navigation Arrows */}
        <div className="mb-4 relative flex items-center justify-center gap-2">
          {/* Left Arrow */}
          <button
            onClick={prevCard}
            disabled={currentCard === 0}
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
              currentCard === 0
                ? 'bg-dark-800/30 text-gray-600 cursor-not-allowed'
                : 'bg-dark-800/80 hover:bg-dark-700 text-white hover:text-festive-gold border border-dark-600 hover:border-festive-gold/50'
            }`}
            aria-label="Previous card"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div
            ref={cardRef}
            className="w-full max-w-[400px] mx-auto"
            style={{ aspectRatio: '10/13', position: 'relative' }}
          >
            {/* Loading skeleton */}
            {imageLoading && (
              <div
                className="absolute inset-0 rounded-2xl overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #0a0a1a 100%)',
                  border: '2px solid rgba(139, 92, 246, 0.3)',
                }}
              >
                {/* Shimmer effect */}
                <div
                  className="absolute inset-0 -translate-x-full animate-shimmer"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.1), transparent)',
                  }}
                />
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <div className="relative">
                    <div className="w-14 h-14 border-2 border-festive-purple/20 rounded-full" />
                    <div className="absolute inset-0 w-14 h-14 border-2 border-transparent border-t-festive-purple rounded-full animate-spin" />
                    <div className="absolute inset-2 w-10 h-10 border-2 border-transparent border-b-festive-gold rounded-full animate-spin-reverse" />
                  </div>
                  <div className="text-gray-400 text-sm font-medium">Generating card...</div>
                  <div className="text-gray-500 text-xs">This only takes a few seconds!</div>
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-festive-purple/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-festive-purple/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-festive-purple/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <img
              key={currentCard}
              src={`/api/card/${address}/${currentCard}`}
              alt={`${highlight.title} card`}
              className="w-full h-full rounded-2xl"
              style={{
                display: 'block',
                opacity: imageLoading ? 0 : 1,
                transition: 'opacity 0.2s ease-in-out',
              }}
              draggable={false}
              onLoad={() => setImageLoading(false)}
            />
            {/* Sparkle effect on card reveal */}
            {sparklingCard === currentCard && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
                {/* Corner bursts */}
                <div className="absolute top-4 left-4 w-3 h-3 bg-festive-gold rounded-full animate-sparkle-1" />
                <div className="absolute top-4 right-4 w-3 h-3 bg-festive-pink rounded-full animate-sparkle-2" />
                <div className="absolute bottom-4 left-4 w-3 h-3 bg-festive-purple rounded-full animate-sparkle-3" />
                <div className="absolute bottom-4 right-4 w-3 h-3 bg-festive-gold rounded-full animate-sparkle-4" />
                {/* Edge sparkles */}
                <div className="absolute top-1/2 left-4 w-2 h-2 bg-white rounded-full animate-sparkle-5" />
                <div className="absolute top-1/2 right-4 w-2 h-2 bg-festive-pink rounded-full animate-sparkle-6" />
                <div className="absolute top-1/4 left-1/2 w-2.5 h-2.5 bg-festive-gold rounded-full animate-sparkle-1" />
                <div className="absolute bottom-1/4 left-1/2 w-2.5 h-2.5 bg-festive-purple rounded-full animate-sparkle-3" />
                {/* Center glow pulse */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-festive-gold/50 rounded-full animate-ping" />
              </div>
            )}
          </div>

          {/* Right Arrow */}
          <button
            onClick={nextCard}
            disabled={!data || currentCard === data.highlights.length - 1}
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
              !data || currentCard === data.highlights.length - 1
                ? 'bg-dark-800/30 text-gray-600 cursor-not-allowed'
                : 'bg-dark-800/80 hover:bg-dark-700 text-white hover:text-festive-gold border border-dark-600 hover:border-festive-gold/50'
            }`}
            aria-label="Next card"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Share to X with Summary Preview */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6 items-center p-4 rounded-xl bg-dark-800/50 border border-primary-500/50 animate-glow-pulse shadow-lg shadow-primary-500/20">
          <div className="flex-1 w-full">
            <div className="text-sm text-gray-400 mb-2">Share your complete 2025 summary</div>
            <button
              onClick={shareToX}
              disabled={shareStatus === 'sharing'}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-black hover:bg-gray-900 border border-gray-700 text-white font-medium transition-all duration-200"
            >
              {shareStatus === 'sharing' ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Sharing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  Share to X (image auto-copied)
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </>
              )}
            </button>
          </div>
          {/* Summary Card Thumbnail */}
          <div className="relative flex-shrink-0 sm:w-20 sm:h-[100px] w-24 h-[120px]">
            <img
              src={`/api/card/${address}/summary`}
              alt="Summary preview"
              className="w-full h-full object-cover rounded-lg border border-primary-500/30"
            />
          </div>
        </div>

        {/* Card Action Buttons */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={copyCardToClipboard}
            disabled={copyStatus === 'copying'}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border font-medium transition-all duration-200 ${
              copyStatus === 'success'
                ? 'bg-green-500/20 border-green-500 text-green-400'
                : copyStatus === 'error'
                ? 'bg-red-500/20 border-red-500 text-red-400'
                : 'bg-dark-800 hover:bg-dark-700 border-dark-600 hover:border-primary-500/50 text-white'
            }`}
          >
            {copyStatus === 'copying' ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Copying...
              </>
            ) : copyStatus === 'success' ? (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : copyStatus === 'error' ? (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Failed
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Image
              </>
            )}
          </button>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={prevCard}
            disabled={currentCard === 0}
            className="btn-ghost disabled:opacity-30 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Prev
          </button>

          <div className="flex gap-2">
            {data.highlights.map((_, idx) => (
              <button
                key={idx}
                onClick={() => selectCard(idx)}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  idx === currentCard
                    ? 'bg-festive-gold w-6'
                    : 'bg-gray-600 hover:bg-gray-500'
                }`}
              />
            ))}
          </div>

          <button
            onClick={nextCard}
            disabled={currentCard === data.highlights.length - 1}
            className="btn-ghost disabled:opacity-30 flex items-center gap-2"
          >
            Next
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* All Highlights Grid - 2 rows of 3 (2 cols on mobile) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-2 mb-8">
          {data.highlights.map((h, idx) => {
            const HighlightIcon = getHighlightIcon(h.type);
            const isRevealed = revealedCards.has(idx); // Persistent reveal state
            const isSparkling = sparklingCard === idx;
            return (
              <button
                key={h.id}
                onClick={() => selectCard(idx)}
                className={`card-hover text-center p-3 transition-all duration-300 relative overflow-hidden ${
                  idx === currentCard
                    ? 'border-festive-gold shadow-[0_0_20px_rgba(255,215,0,0.3)]'
                    : ''
                }`}
              >
                {/* Sparkle/pop effect when revealed */}
                {isSparkling && (
                  <div className="absolute inset-0 pointer-events-none">
                    {/* Center burst */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-festive-gold rounded-full animate-ping" />
                    {/* Sparkle particles */}
                    <div className="absolute top-1/4 left-1/4 w-1.5 h-1.5 bg-festive-gold rounded-full animate-sparkle-1" />
                    <div className="absolute top-1/4 right-1/4 w-1.5 h-1.5 bg-festive-pink rounded-full animate-sparkle-2" />
                    <div className="absolute bottom-1/4 left-1/3 w-1.5 h-1.5 bg-festive-purple rounded-full animate-sparkle-3" />
                    <div className="absolute bottom-1/4 right-1/3 w-1.5 h-1.5 bg-festive-gold rounded-full animate-sparkle-4" />
                    <div className="absolute top-1/3 left-1/2 w-1 h-1 bg-white rounded-full animate-sparkle-5" />
                    <div className="absolute bottom-1/3 right-1/4 w-1 h-1 bg-festive-pink rounded-full animate-sparkle-6" />
                  </div>
                )}
                <div className="flex justify-center mb-2">
                  <span className={`${h.colorScheme === 'profit' ? 'text-profit-500' : h.colorScheme === 'loss' ? 'text-loss-500' : 'text-festive-purple'}`}>
                    <HighlightIcon />
                  </span>
                </div>
                <div className="font-bold text-xs truncate text-white mb-1">{h.title}</div>
                {isRevealed ? (
                  <div className={`text-xs truncate transition-all duration-300 ${isSparkling ? 'scale-110' : ''} ${h.colorScheme === 'profit' ? 'text-profit-500' : h.colorScheme === 'loss' ? 'text-loss-500' : 'text-gray-400'}`}>
                    {h.value}
                  </div>
                ) : (
                  <div className="text-xs text-gray-600">???</div>
                )}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Link href="/" className="btn-secondary w-full text-center">
            Analyze Another Wallet
          </Link>
        </div>
      </div>
    </main>
  );
}

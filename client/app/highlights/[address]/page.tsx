'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface HighlightMetadata {
  tokenSymbol?: string;
  tokenMint?: string;
  tradesCount?: number;
  profitPercent?: number;
  lossPercent?: number;
  holdingDays?: number;
  month?: string;
  monthPNL?: number;
}

interface ServerHighlight {
  type: string;
  title: string;
  description: string;
  valuePrimary: number;
  valueSecondary: number;
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
  emoji: string;
  colorScheme: string;
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
const highlightConfig: Record<string, { emoji: string; colorScheme: string }> = {
  biggest_realized_win: { emoji: '🚀', colorScheme: 'profit' },
  biggest_realized_loss: { emoji: '📉', colorScheme: 'loss' },
  best_unrealized_gain: { emoji: '💎', colorScheme: 'profit' },
  worst_unrealized_loss: { emoji: '😰', colorScheme: 'loss' },
  best_single_trade: { emoji: '🎯', colorScheme: 'profit' },
  most_traded_token: { emoji: '🔄', colorScheme: 'neutral' },
  diamond_hands: { emoji: '💎🙌', colorScheme: 'neutral' },
  paper_hands: { emoji: '📃🙌', colorScheme: 'neutral' },
  total_realized_pnl: { emoji: '💰', colorScheme: 'default' },
  total_unrealized_pnl: { emoji: '📊', colorScheme: 'default' },
  win_rate: { emoji: '🏆', colorScheme: 'neutral' },
  best_month: { emoji: '📅', colorScheme: 'profit' },
};

function transformHighlight(serverHighlight: ServerHighlight): Highlight {
  const config = highlightConfig[serverHighlight.type] || { emoji: '✨', colorScheme: 'default' };

  // Determine color scheme based on value if type is pnl-related
  let colorScheme = config.colorScheme;
  if (colorScheme === 'default') {
    if (serverHighlight.type.includes('pnl')) {
      colorScheme = serverHighlight.valuePrimary >= 0 ? 'profit' : 'loss';
    }
  }

  // Get token ticker from metadata
  const tokenTicker = serverHighlight.metadata?.tokenSymbol || undefined;

  // Format the primary value
  let value = '';
  if (serverHighlight.type === 'win_rate') {
    value = `${serverHighlight.valuePrimary}%`;
  } else if (serverHighlight.type === 'most_traded_token') {
    value = `$${tokenTicker || 'UNKNOWN'}`;
  } else if (serverHighlight.type === 'diamond_hands' || serverHighlight.type === 'paper_hands') {
    value = `$${tokenTicker || 'UNKNOWN'}`;
  } else if (serverHighlight.type === 'best_month') {
    const sign = serverHighlight.valuePrimary >= 0 ? '+' : '';
    value = `${sign}${serverHighlight.valuePrimary.toFixed(2)} SOL`;
  } else {
    // For token-specific highlights (wins, losses, gains), include ticker
    const sign = serverHighlight.valuePrimary >= 0 ? '+' : '';
    const solValue = `${sign}${serverHighlight.valuePrimary.toFixed(2)} SOL`;
    value = tokenTicker ? `${solValue} ($${tokenTicker})` : solValue;
  }

  // Format subtitle (USD value or additional context)
  let subtitle = '';
  if (serverHighlight.type === 'most_traded_token') {
    subtitle = `${serverHighlight.valuePrimary} trades`;
  } else if (serverHighlight.type === 'diamond_hands') {
    subtitle = `${serverHighlight.valuePrimary} days held`;
  } else if (serverHighlight.type === 'paper_hands') {
    subtitle = `Sold after ${serverHighlight.valuePrimary} minutes`;
  } else if (serverHighlight.valueSecondary && serverHighlight.type !== 'win_rate') {
    const sign = serverHighlight.valueSecondary >= 0 ? '+' : '';
    subtitle = `${sign}$${Math.abs(serverHighlight.valueSecondary).toLocaleString(undefined, { maximumFractionDigits: 2 })} USD`;
  } else if (serverHighlight.metadata?.tradesCount) {
    subtitle = `${serverHighlight.metadata.tradesCount} trades`;
  }

  // Build context from metadata
  let context = serverHighlight.description;
  if (serverHighlight.metadata?.profitPercent) {
    context = `${serverHighlight.metadata.profitPercent}% return`;
  } else if (serverHighlight.metadata?.lossPercent) {
    context = `${serverHighlight.metadata.lossPercent}% loss`;
  } else if (serverHighlight.metadata?.holdingDays) {
    context = `Held for ${serverHighlight.metadata.holdingDays} days`;
  }

  return {
    id: `${serverHighlight.type}-${serverHighlight.rank}`,
    type: serverHighlight.type,
    title: serverHighlight.title.replace(/\s*[🚀📉💎😰🎯🔄📃🙌💰📊🏆📅✨]+\s*/g, '').trim(), // Remove emoji from title, we add our own
    value,
    subtitle,
    context,
    emoji: config.emoji,
    colorScheme,
    rank: serverHighlight.rank,
    tokenTicker,
  };
}

export default function HighlightsPage() {
  const params = useParams();
  const router = useRouter();
  const address = params.address as string;

  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentCard, setCurrentCard] = useState(0);

  useEffect(() => {
    if (!address) return;
    fetchHighlights();
  }, [address]);

  const fetchHighlights = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

      // Fetch both summary and highlights in parallel
      const [summaryRes, highlightsRes] = await Promise.all([
        fetch(`${apiUrl}/api/wallet/${address}/summary`),
        fetch(`${apiUrl}/api/wallet/${address}/highlights`)
      ]);

      if (!summaryRes.ok || !highlightsRes.ok) {
        throw new Error('Failed to fetch wallet data');
      }

      const [summaryData, highlightsData] = await Promise.all([
        summaryRes.json(),
        highlightsRes.json()
      ]);

      // Transform server highlights to frontend format
      const transformedHighlights = (highlightsData as ServerHighlight[]).map(transformHighlight);

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
        highlights: transformedHighlights,
      });
    } catch (err: any) {
      console.error('Failed to fetch highlights:', err);
      setError(err.message || 'Failed to load highlights');
    } finally {
      setLoading(false);
    }
  };

  const formatPNL = (value: number) => {
    const formatted = Math.abs(value).toFixed(2);
    const prefix = value >= 0 ? '+' : '-';
    return `${prefix}${formatted} SOL`;
  };

  const getColorClass = (colorScheme: string) => {
    switch (colorScheme) {
      case 'profit':
        return 'from-profit-500 to-profit-600';
      case 'loss':
        return 'from-loss-500 to-loss-600';
      case 'neutral':
        return 'from-gray-500 to-gray-600';
      default:
        return 'from-primary-500 to-secondary-500';
    }
  };

  const nextCard = () => {
    if (data && currentCard < data.highlights.length - 1) {
      setCurrentCard(currentCard + 1);
    }
  };

  const prevCard = () => {
    if (currentCard > 0) {
      setCurrentCard(currentCard - 1);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner w-16 h-16 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading your highlights...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="card border-loss-500">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-loss-500/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-loss-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-2">Error Loading Highlights</h2>
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
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="card">
            <div className="text-center">
              <div className="text-6xl mb-4">📊</div>
              <h2 className="text-2xl font-bold mb-2">No Highlights Found</h2>
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
    <main className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Your Wallet Wrapped</h1>
          <p className="text-gray-400 text-sm font-mono break-all">{address}</p>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card text-center">
            <div className={`text-2xl font-bold ${data.summary.totalPNL >= 0 ? 'text-profit-500' : 'text-loss-500'}`}>
              {formatPNL(data.summary.totalPNL)}
            </div>
            <div className="text-sm text-gray-400">Total P&L</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-primary-500">
              {data.summary.transactionCount}
            </div>
            <div className="text-sm text-gray-400">Transactions</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-accent-500">
              {data.summary.closedPositions}
            </div>
            <div className="text-sm text-gray-400">Tokens Traded</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-primary-500">
              {data.summary.winRate.toFixed(0)}%
            </div>
            <div className="text-sm text-gray-400">Win Rate</div>
          </div>
        </div>

        {/* Highlight Card */}
        <div className="relative mb-8">
          <div
            className={`card bg-gradient-to-br ${getColorClass(highlight.colorScheme)} p-8 text-white min-h-[300px] flex flex-col justify-center items-center text-center`}
          >
            <div className="text-6xl mb-4">{highlight.emoji}</div>
            <h2 className="text-2xl font-bold mb-2">{highlight.title}</h2>
            {highlight.tokenTicker && !highlight.value.includes(highlight.tokenTicker) && (
              <div className="text-xl font-semibold opacity-90 mb-1">${highlight.tokenTicker}</div>
            )}
            <div className="text-4xl font-bold mb-2">{highlight.value}</div>
            <p className="text-lg opacity-90 mb-2">{highlight.subtitle}</p>
            <p className="text-sm opacity-75">{highlight.context}</p>
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center mt-4">
            <button
              onClick={prevCard}
              disabled={currentCard === 0}
              className="btn-ghost disabled:opacity-30"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>

            <div className="flex gap-2">
              {data.highlights.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentCard(idx)}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    idx === currentCard ? 'bg-primary-500' : 'bg-gray-600'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={nextCard}
              disabled={currentCard === data.highlights.length - 1}
              className="btn-ghost disabled:opacity-30"
            >
              Next
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* All Highlights Grid */}
        <h3 className="text-xl font-bold mb-4">All Highlights</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {data.highlights.map((h, idx) => (
            <button
              key={h.id}
              onClick={() => setCurrentCard(idx)}
              className={`card-hover text-left ${idx === currentCard ? 'border-primary-500' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl">{h.emoji}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{h.title}</div>
                  {h.tokenTicker && !h.value.includes(h.tokenTicker) && (
                    <div className="text-sm text-primary-400">${h.tokenTicker}</div>
                  )}
                  <div className="text-sm text-gray-400 truncate">{h.value}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-4 justify-center">
          <button className="btn-primary">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
            </svg>
            Share on Twitter
          </button>
          <Link href="/" className="btn-secondary">
            Analyze Another Wallet
          </Link>
        </div>
      </div>
    </main>
  );
}

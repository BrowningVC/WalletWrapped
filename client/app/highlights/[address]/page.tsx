'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

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
      const response = await fetch(`${apiUrl}/api/highlights/${address}`);

      if (!response.ok) {
        throw new Error('Failed to fetch highlights');
      }

      const result = await response.json();
      setData(result);
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
              {(data.summary.winRate * 100).toFixed(0)}%
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
                <div>
                  <div className="font-bold">{h.title}</div>
                  <div className="text-sm text-gray-400">{h.value}</div>
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

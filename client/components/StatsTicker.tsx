'use client';

import { useEffect, useState, useRef } from 'react';

interface PlatformStats {
  walletsAnalyzed: number;
  totalTransactions: number;
  totalVolumeSol: number;
  highestPnl: { valueSol: number; wallet: string | null } | null;
  biggestWin: { valueSol: number; ticker: string | null } | null;
  biggestLoss: { valueSol: number; ticker: string | null } | null;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

function formatSol(num: number): string {
  if (Math.abs(num) >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (Math.abs(num) >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toFixed(1);
}

export default function StatsTicker() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
        const response = await fetch(`${apiUrl}/api/stats`);
        if (response.ok) {
          const data = await response.json();
          setStats({
            walletsAnalyzed: data.walletsAnalyzed || 0,
            totalTransactions: data.totalTransactions || 0,
            totalVolumeSol: data.totalVolumeSol || 0,
            highestPnl: data.highestPnl,
            biggestWin: data.biggestWin,
            biggestLoss: data.biggestLoss,
          });
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
        setIsLoading(false);
      }
    };

    fetchStats();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Build ticker items
  const tickerItems = [];

  if (stats) {
    tickerItems.push({
      icon: '👛',
      label: 'Wallets Wrapped',
      value: formatNumber(stats.walletsAnalyzed),
      color: 'text-festive-gold',
    });

    tickerItems.push({
      icon: '📊',
      label: 'Transactions Analyzed',
      value: formatNumber(stats.totalTransactions),
      color: 'text-festive-pink',
    });

    tickerItems.push({
      icon: '💰',
      label: 'Volume Analyzed',
      value: `${formatSol(stats.totalVolumeSol)} SOL`,
      color: 'text-festive-purple',
    });

    if (stats.highestPnl && stats.highestPnl.valueSol > 0) {
      tickerItems.push({
        icon: '🏆',
        label: 'Highest P&L',
        value: `+${formatSol(stats.highestPnl.valueSol)} SOL`,
        color: 'text-green-400',
      });
    }

    if (stats.biggestWin && stats.biggestWin.valueSol > 0) {
      tickerItems.push({
        icon: '🚀',
        label: 'Biggest Win',
        value: `+${formatSol(stats.biggestWin.valueSol)} SOL${stats.biggestWin.ticker ? ` ($${stats.biggestWin.ticker})` : ''}`,
        color: 'text-green-400',
      });
    }

    if (stats.biggestLoss && stats.biggestLoss.valueSol < 0) {
      tickerItems.push({
        icon: '📉',
        label: 'Biggest Loss',
        value: `${formatSol(stats.biggestLoss.valueSol)} SOL${stats.biggestLoss.ticker ? ` ($${stats.biggestLoss.ticker})` : ''}`,
        color: 'text-red-400',
      });
    }
  }

  // Duplicate items for seamless loop
  const allItems = [...tickerItems, ...tickerItems];

  if (isLoading || tickerItems.length === 0) {
    return null;
  }

  return (
    <div className="w-full bg-dark-900/80 backdrop-blur-sm border-b border-dark-700/50 overflow-hidden">
      <div className="relative flex items-center h-10">
        {/* Left fade gradient */}
        <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-dark-900 to-transparent z-10 pointer-events-none" />

        {/* Scrolling content */}
        <div
          ref={scrollRef}
          className="flex items-center gap-8 animate-scroll whitespace-nowrap"
          style={{
            animationDuration: `${tickerItems.length * 8}s`,
          }}
        >
          {allItems.map((item, index) => (
            <div key={index} className="flex items-center gap-2 px-2">
              <span className="text-sm">{item.icon}</span>
              <span className="text-xs text-gray-500 uppercase tracking-wide">{item.label}</span>
              <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
            </div>
          ))}
        </div>

        {/* Right fade gradient */}
        <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-dark-900 to-transparent z-10 pointer-events-none" />
      </div>

      <style jsx>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-scroll {
          animation: scroll linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}

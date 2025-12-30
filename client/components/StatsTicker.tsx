'use client';

import { useEffect, useState } from 'react';

interface PlatformStats {
  walletsAnalyzed: number;
  totalTransactions: number;
  totalVolumeSol: number;
  solPriceUsd: number;
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

function formatUsd(num: number): string {
  const absNum = Math.abs(num);
  if (absNum >= 1_000_000) {
    return '$' + (num / 1_000_000).toFixed(1) + 'M';
  }
  if (absNum >= 1_000) {
    return '$' + (num / 1_000).toFixed(1) + 'K';
  }
  return '$' + num.toFixed(0);
}

function formatSol(num: number): string {
  const absNum = Math.abs(num);
  if (absNum >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (absNum >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toFixed(1);
}

// Icon components
const WalletIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
);

const ChartIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const CoinIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const TrophyIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
  </svg>
);

const RocketIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const TrendDownIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
  </svg>
);

interface TickerItem {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}

export default function StatsTicker() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Use production API URL as fallback for cases where env var isn't set at build time
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.walletwrapped.io';
        const response = await fetch(`${apiUrl}/api/stats`);
        if (response.ok) {
          const data = await response.json();
          setStats({
            walletsAnalyzed: data.walletsAnalyzed || 0,
            totalTransactions: data.totalTransactions || 0,
            totalVolumeSol: data.totalVolumeSol || 0,
            solPriceUsd: data.solPriceUsd || 0,
            highestPnl: data.highestPnl,
            biggestWin: data.biggestWin,
            biggestLoss: data.biggestLoss,
          });
        } else {
          console.error('Failed to fetch stats: HTTP', response.status);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        // Always set loading to false, whether success or failure
        setIsLoading(false);
      }
    };

    fetchStats();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Build ticker items
  const tickerItems: TickerItem[] = [];
  const solPrice = stats?.solPriceUsd || 0;

  if (stats) {
    tickerItems.push({
      icon: <WalletIcon />,
      label: 'Wallets Wrapped',
      value: formatNumber(stats.walletsAnalyzed),
      color: 'text-festive-gold',
    });

    tickerItems.push({
      icon: <ChartIcon />,
      label: 'Transactions Analyzed',
      value: formatNumber(stats.totalTransactions),
      color: 'text-festive-pink',
    });

    if (stats.totalVolumeSol > 0 && solPrice > 0) {
      const volumeUsd = stats.totalVolumeSol * solPrice;
      tickerItems.push({
        icon: <CoinIcon />,
        label: 'Volume Analyzed',
        value: `${formatUsd(volumeUsd)} (${formatSol(stats.totalVolumeSol)} SOL)`,
        color: 'text-festive-purple',
      });
    }

    if (stats.highestPnl && stats.highestPnl.valueSol > 0 && solPrice > 0) {
      const pnlUsd = stats.highestPnl.valueSol * solPrice;
      tickerItems.push({
        icon: <TrophyIcon />,
        label: 'Highest P&L',
        value: `+${formatUsd(pnlUsd)} (+${formatSol(stats.highestPnl.valueSol)} SOL)`,
        color: 'text-green-400',
      });
    }

    if (stats.biggestWin && stats.biggestWin.valueSol > 0 && solPrice > 0) {
      const winUsd = stats.biggestWin.valueSol * solPrice;
      tickerItems.push({
        icon: <RocketIcon />,
        label: 'Biggest Win',
        value: `+${formatUsd(winUsd)} (+${formatSol(stats.biggestWin.valueSol)} SOL)${stats.biggestWin.ticker ? ` $${stats.biggestWin.ticker}` : ''}`,
        color: 'text-green-400',
      });
    }

    if (stats.biggestLoss && stats.biggestLoss.valueSol < 0 && solPrice > 0) {
      const lossUsd = stats.biggestLoss.valueSol * solPrice;
      tickerItems.push({
        icon: <TrendDownIcon />,
        label: 'Biggest Loss',
        value: `${formatUsd(lossUsd)} (${formatSol(stats.biggestLoss.valueSol)} SOL)${stats.biggestLoss.ticker ? ` $${stats.biggestLoss.ticker}` : ''}`,
        color: 'text-red-400',
      });
    }
  }

  // Duplicate items for seamless loop
  const allItems = [...tickerItems, ...tickerItems];

  // Show a thin loading bar while fetching stats
  if (isLoading) {
    return (
      <div className="w-full h-10 bg-dark-900/80 backdrop-blur-sm border-b border-dark-700/50">
        <div className="h-full flex items-center justify-center">
          <div className="w-24 h-1 bg-dark-700 rounded-full overflow-hidden">
            <div className="h-full w-1/2 bg-festive-gold/50 animate-pulse rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  // Don't render if no stats available
  if (tickerItems.length === 0) {
    return null;
  }

  return (
    <div className="w-full bg-dark-900/80 backdrop-blur-sm border-b border-dark-700/50 overflow-hidden">
      <div className="relative flex items-center h-10">
        {/* Left fade gradient */}
        <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-dark-900 to-transparent z-10 pointer-events-none" />

        {/* Scrolling content */}
        <div className="flex items-center gap-8 animate-ticker-scroll whitespace-nowrap hover:[animation-play-state:paused]">
          {allItems.map((item, index) => (
            <div key={index} className="flex items-center gap-2 px-2">
              <span className={item.color}>{item.icon}</span>
              <span className="text-xs text-gray-500 uppercase tracking-wide">{item.label}</span>
              <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
            </div>
          ))}
        </div>

        {/* Right fade gradient */}
        <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-dark-900 to-transparent z-10 pointer-events-none" />
      </div>
    </div>
  );
}

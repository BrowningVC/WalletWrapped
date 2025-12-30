'use client';

import { useEffect, useState } from 'react';

interface Stats {
  walletsAnalyzed: number;
  activeAnalyses: number;
}

interface WalletCounterProps {
  variant?: 'default' | 'compact';
  showActive?: boolean;
}

export default function WalletCounter({ variant = 'default', showActive = false }: WalletCounterProps) {
  const [stats, setStats] = useState<Stats>({ walletsAnalyzed: 0, activeAnalyses: 0 });
  const [displayCount, setDisplayCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch stats on mount and poll every 5 seconds
  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Use production API URL as fallback for cases where env var isn't set at build time
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.walletwrapped.io';
        const response = await fetch(`${apiUrl}/api/stats`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (response.ok) {
          const data = await response.json();
          setStats({
            walletsAnalyzed: data.walletsAnalyzed || 0,
            activeAnalyses: data.activeAnalyses || 0,
          });
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);

    return () => clearInterval(interval);
  }, []);

  // Animate the counter when stats change
  useEffect(() => {
    if (displayCount === stats.walletsAnalyzed) return;

    const diff = stats.walletsAnalyzed - displayCount;
    const step = Math.max(1, Math.ceil(Math.abs(diff) / 20));
    const direction = diff > 0 ? 1 : -1;

    const interval = setInterval(() => {
      setDisplayCount((prev) => {
        const next = prev + step * direction;
        if ((direction > 0 && next >= stats.walletsAnalyzed) ||
            (direction < 0 && next <= stats.walletsAnalyzed)) {
          clearInterval(interval);
          return stats.walletsAnalyzed;
        }
        return next;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [stats.walletsAnalyzed, displayCount]);

  if (variant === 'compact') {
    return (
      <div className="inline-flex items-center gap-2.5 px-4 py-2 bg-dark-800/90 backdrop-blur-sm border border-dark-600/50 rounded-full">
        {/* Live indicator */}
        <div className="relative flex items-center justify-center">
          <span className="absolute w-2 h-2 bg-green-400 rounded-full animate-ping opacity-50" />
          <span className="relative w-2 h-2 bg-green-400 rounded-full" />
        </div>
        <span className="text-sm text-gray-300">
          <span className="font-semibold text-white tabular-nums">{displayCount.toLocaleString()}</span>
          <span className="text-gray-500 ml-1">analyzed</span>
        </span>
        {showActive && stats.activeAnalyses > 0 && (
          <>
            <span className="w-px h-3 bg-dark-500" />
            <span className="text-sm font-medium text-festive-pink">
              {stats.activeAnalyses} live
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 px-4 py-2 bg-dark-900/60 backdrop-blur-sm border border-dark-700/50 rounded-full">
      {/* Simple live dot */}
      <div className="relative flex items-center justify-center">
        <span className="absolute w-2 h-2 bg-green-400/40 rounded-full animate-ping" />
        <span className="relative w-1.5 h-1.5 bg-green-400 rounded-full" />
      </div>

      {/* Counter */}
      <span className="text-sm text-gray-300">
        <span className="font-semibold text-white tabular-nums">
          {isLoading ? '---' : displayCount.toLocaleString()}
        </span>
        <span className="text-gray-500 ml-1.5">wallets analyzed</span>
      </span>

      {/* Active analyses (if any) */}
      {showActive && stats.activeAnalyses > 0 && (
        <>
          <span className="w-px h-3 bg-dark-600" />
          <span className="text-xs font-medium text-festive-gold">
            {stats.activeAnalyses} active
          </span>
        </>
      )}
    </div>
  );
}

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
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
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
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
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
    <div className="relative group">
      {/* Gradient border effect */}
      <div className="absolute -inset-[1px] bg-gradient-to-r from-festive-gold/40 via-festive-pink/40 to-festive-purple/40 rounded-2xl opacity-60 group-hover:opacity-100 transition-opacity duration-500 blur-[1px]" />

      {/* Main container */}
      <div className="relative flex items-center gap-4 px-6 py-3.5 bg-dark-900/95 backdrop-blur-md rounded-2xl">
        {/* Live pulse indicator */}
        <div className="relative flex items-center justify-center w-3 h-3">
          <span className="absolute w-full h-full bg-green-400/30 rounded-full animate-ping" />
          <span className="absolute w-2.5 h-2.5 bg-green-400/20 rounded-full animate-pulse" />
          <span className="relative w-2 h-2 bg-green-400 rounded-full shadow-lg shadow-green-400/50" />
        </div>

        {/* Counter section */}
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-400 tracking-wide leading-tight">
            wallets analyzed
          </span>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold tabular-nums bg-gradient-to-r from-white via-white to-gray-300 bg-clip-text text-transparent leading-tight">
              {isLoading ? (
                <span className="animate-pulse text-gray-500">---</span>
              ) : (
                displayCount.toLocaleString()
              )}
            </span>
            {/* Active counting indicator */}
            {!isLoading && (
              <div className="flex items-center gap-1 text-festive-gold/80">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                </svg>
                <span className="text-xs font-medium animate-pulse">updating</span>
              </div>
            )}
          </div>
        </div>

        {/* Active analyses badge */}
        {showActive && stats.activeAnalyses > 0 && (
          <>
            <div className="w-px h-6 bg-gradient-to-b from-transparent via-dark-500 to-transparent" />
            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="absolute inset-0 bg-festive-pink/20 rounded-full animate-pulse" />
                <span className="relative flex items-center gap-1.5 px-3 py-1 bg-festive-pink/10 border border-festive-pink/30 rounded-full">
                  <span className="w-1.5 h-1.5 bg-festive-pink rounded-full animate-pulse" />
                  <span className="text-sm font-semibold text-festive-pink">
                    {stats.activeAnalyses}
                  </span>
                  <span className="text-xs text-festive-pink/70">live</span>
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

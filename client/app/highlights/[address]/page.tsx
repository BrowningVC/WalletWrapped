'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import html2canvas from 'html2canvas';

type Theme = 'holographic' | 'cyberpunk' | 'aurora' | 'candy';

// SVG Icon Components
const Icons = {
  // Theme icons
  holographic: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
      <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.3" />
    </svg>
  ),
  cyberpunk: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 9h.01M15 9h.01M9 15h6" />
      <path d="M4 12h2m12 0h2" strokeLinecap="round" />
    </svg>
  ),
  aurora: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2l.324 1.62a9 9 0 004.056 4.056L18 8l-1.62.324a9 9 0 00-4.056 4.056L12 14l-.324-1.62a9 9 0 00-4.056-4.056L6 8l1.62-.324a9 9 0 004.056-4.056L12 2z" fill="currentColor" opacity="0.3" />
      <circle cx="18" cy="18" r="2" />
      <circle cx="6" cy="18" r="1" />
    </svg>
  ),
  candy: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="6" />
      <path d="M12 6c-2 0-4 2-4 6s2 6 4 6" strokeLinecap="round" />
      <path d="M6.5 9L4 7M17.5 9l2.5-2M6.5 15L4 17M17.5 15l2.5 2" strokeLinecap="round" />
    </svg>
  ),
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

const themeInfo: Record<Theme, { name: string; icon: React.FC }> = {
  holographic: { name: 'Holographic', icon: Icons.holographic },
  cyberpunk: { name: 'Cyberpunk', icon: Icons.cyberpunk },
  aurora: { name: 'Aurora', icon: Icons.aurora },
  candy: { name: 'Candy', icon: Icons.candy },
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
          value = numValue >= 0 ? `+$${Math.abs(numValue)}` : `-$${Math.abs(numValue)}`;
        }
      }
      if (subtitle && !subtitle.includes('SOL') && !subtitle.includes('(')) {
        const numSol = parseFloat(subtitle);
        if (isNaN(numSol)) {
          subtitle = '0 SOL';
        } else {
          subtitle = numSol >= 0 ? `+${Math.abs(numSol)} SOL` : `-${Math.abs(numSol)} SOL`;
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

// Theme-specific decorative backgrounds
function HolographicDecorations() {
  return (
    <>
      {/* Holographic prismatic shapes */}
      <div className="absolute top-4 right-4 w-24 h-24 opacity-60">
        <div className="absolute inset-0 bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 rounded-full blur-xl" />
        <div className="absolute inset-2 bg-gradient-to-tr from-orange-400 via-pink-500 to-purple-600 rounded-full blur-lg" />
      </div>
      <div className="absolute bottom-32 left-4 w-16 h-16 opacity-50">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 via-purple-500 to-pink-500 rounded-full blur-lg" />
      </div>
      {/* Rainbow line accents */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 via-yellow-500 via-green-500 via-cyan-500 to-purple-500" />
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-cyan-500 via-green-500 via-yellow-500 to-pink-500" />
      {/* Floating diamonds */}
      <div className="absolute top-[20%] left-[15%] text-2xl opacity-40 rotate-45 text-purple-300">◇</div>
      <div className="absolute top-[55%] right-[10%] text-3xl opacity-30 -rotate-12 text-cyan-300">◇</div>
      <div className="absolute bottom-[30%] left-[80%] text-xl opacity-50 rotate-12 text-pink-300">◇</div>
    </>
  );
}

function CyberpunkDecorations() {
  return (
    <>
      {/* Neon grid lines */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/4 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500 to-transparent" />
        <div className="absolute top-2/4 left-0 right-0 h-px bg-gradient-to-r from-transparent via-pink-500 to-transparent" />
        <div className="absolute top-[65%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500 to-transparent" />
        <div className="absolute top-0 bottom-0 left-1/4 w-px bg-gradient-to-b from-transparent via-cyan-500 to-transparent" />
        <div className="absolute top-0 bottom-0 right-1/4 w-px bg-gradient-to-b from-transparent via-pink-500 to-transparent" />
      </div>
      {/* Glitch rectangles */}
      <div className="absolute top-8 right-8 w-20 h-8 border-2 border-cyan-500 opacity-60" />
      <div className="absolute top-10 right-6 w-20 h-8 border-2 border-pink-500 opacity-40" />
      {/* Circuit patterns */}
      <div className="absolute bottom-28 left-4 text-cyan-500 opacity-40 text-xs font-mono">
        {'>>_SYS.2024'}
      </div>
      <div className="absolute top-16 right-4 text-pink-500 opacity-40 text-xs font-mono">
        {'[PROFIT.EXE]'}
      </div>
      {/* Neon corner brackets */}
      <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-cyan-500 opacity-70" />
      <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-pink-500 opacity-70" />
      {/* Scanline effect overlay */}
      <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.1)_2px,rgba(0,0,0,0.1)_4px)] pointer-events-none" />
    </>
  );
}

function AuroraDecorations() {
  return (
    <>
      {/* Northern lights waves */}
      <div className="absolute top-0 left-0 right-0 h-48 overflow-hidden opacity-60">
        <div className="absolute inset-0 bg-gradient-to-b from-green-400/30 via-cyan-500/20 to-transparent" />
        <div className="absolute top-4 left-[10%] w-[80%] h-24 bg-gradient-to-r from-transparent via-green-400/40 to-transparent rounded-full blur-2xl" />
        <div className="absolute top-8 left-[20%] w-[60%] h-20 bg-gradient-to-r from-transparent via-purple-500/30 to-transparent rounded-full blur-xl" />
        <div className="absolute top-12 left-[5%] w-[90%] h-16 bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent rounded-full blur-2xl" />
      </div>
      {/* Stars */}
      <div className="absolute top-[15%] left-[10%] w-1 h-1 bg-white rounded-full opacity-80" />
      <div className="absolute top-[8%] left-[30%] w-1.5 h-1.5 bg-white rounded-full opacity-60" />
      <div className="absolute top-[12%] right-[20%] w-1 h-1 bg-white rounded-full opacity-70" />
      <div className="absolute top-[5%] right-[35%] w-0.5 h-0.5 bg-white rounded-full opacity-50" />
      <div className="absolute top-[18%] left-[60%] w-1 h-1 bg-cyan-300 rounded-full opacity-60" />
      <div className="absolute top-[10%] left-[80%] w-1.5 h-1.5 bg-green-300 rounded-full opacity-50" />
      {/* Mountain silhouette - positioned higher to not overlap footer */}
      <div className="absolute bottom-16 left-0 right-0 h-16 opacity-20 pointer-events-none">
        <svg viewBox="0 0 400 64" className="w-full h-full" preserveAspectRatio="none">
          <path d="M0 64 L0 48 L50 32 L100 44 L150 24 L200 40 L250 20 L300 36 L350 28 L400 40 L400 64 Z" fill="#1a1a2e"/>
        </svg>
      </div>
    </>
  );
}

function CandyDecorations() {
  return (
    <>
      {/* Floating candy/bubble shapes */}
      <div className="absolute top-8 right-8 w-16 h-16 rounded-full bg-gradient-to-br from-pink-300 to-pink-400 opacity-60" />
      <div className="absolute top-12 right-20 w-8 h-8 rounded-full bg-gradient-to-br from-purple-300 to-purple-400 opacity-50" />
      <div className="absolute bottom-32 left-6 w-12 h-12 rounded-full bg-gradient-to-br from-cyan-300 to-cyan-400 opacity-50" />
      <div className="absolute top-1/3 left-4 w-6 h-6 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-400 opacity-60" />
      <div className="absolute bottom-[38%] right-6 w-10 h-10 rounded-full bg-gradient-to-br from-green-300 to-green-400 opacity-40" />
      {/* Confetti dots */}
      <div className="absolute top-[20%] left-[20%] w-3 h-3 rounded-full bg-pink-400 opacity-70" />
      <div className="absolute top-[30%] right-[15%] w-2 h-2 rounded-full bg-yellow-400 opacity-60" />
      <div className="absolute top-[50%] left-[10%] w-2.5 h-2.5 rounded-full bg-purple-400 opacity-50" />
      <div className="absolute bottom-[38%] right-[25%] w-2 h-2 rounded-full bg-cyan-400 opacity-60" />
      <div className="absolute bottom-[25%] left-[30%] w-3 h-3 rounded-full bg-green-400 opacity-50" />
      {/* Wavy line decorations */}
      <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-r from-pink-300 via-purple-300 via-cyan-300 to-pink-300 opacity-50" />
      {/* Star sprinkles */}
      <div className="absolute top-[40%] right-[8%] text-yellow-400 opacity-70">★</div>
      <div className="absolute top-[15%] left-[25%] text-pink-400 opacity-60 text-sm">★</div>
      <div className="absolute bottom-[42%] left-[5%] text-purple-400 opacity-50">★</div>
    </>
  );
}

// PNL Card Component - fully themed design
function PNLCard({ highlight, walletAddress, theme }: { highlight: Highlight; walletAddress: string; theme: Theme }) {
  const isProfit = highlight.colorScheme === 'profit';
  const isLoss = highlight.colorScheme === 'loss';

  const cardClass = isProfit
    ? 'pnl-card pnl-card-profit'
    : isLoss
      ? 'pnl-card pnl-card-loss'
      : 'pnl-card pnl-card-neutral';

  // Theme-specific styles
  const getThemeStyles = () => {
    switch (theme) {
      case 'holographic':
        return {
          valueClass: isProfit ? 'text-cyan-300' : isLoss ? 'text-pink-400' : 'text-purple-300',
          subtitleClass: 'text-gray-300',
          accentClass: 'text-purple-400',
          labelClass: 'text-gray-400',
          contextClass: 'text-gray-400/80',
          borderClass: 'border-purple-400/30',
        };
      case 'cyberpunk':
        return {
          valueClass: isProfit ? 'text-cyan-400' : isLoss ? 'text-pink-500' : 'text-yellow-400',
          subtitleClass: 'text-gray-300',
          accentClass: 'text-yellow-400',
          labelClass: 'text-gray-400',
          contextClass: 'text-gray-400/80',
          borderClass: 'border-cyan-500/30',
        };
      case 'aurora':
        return {
          valueClass: isProfit ? 'text-green-300' : isLoss ? 'text-purple-400' : 'text-cyan-300',
          subtitleClass: 'text-gray-300',
          accentClass: 'text-cyan-300',
          labelClass: 'text-gray-400',
          contextClass: 'text-gray-400/80',
          borderClass: 'border-green-400/30',
        };
      case 'candy':
        return {
          valueClass: isProfit ? 'text-green-600' : isLoss ? 'text-pink-600' : 'text-purple-600',
          subtitleClass: 'text-gray-700',
          accentClass: 'text-pink-500',
          labelClass: 'text-gray-600',
          contextClass: 'text-gray-600/90',
          borderClass: 'border-pink-300',
        };
    }
  };

  const styles = getThemeStyles();

  // Theme-specific decorations
  const renderDecorations = () => {
    switch (theme) {
      case 'holographic':
        return <HolographicDecorations />;
      case 'cyberpunk':
        return <CyberpunkDecorations />;
      case 'aurora':
        return <AuroraDecorations />;
      case 'candy':
        return <CandyDecorations />;
    }
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
    <div className={`${cardClass} w-full mx-auto`} style={{ height: '520px', minHeight: '520px' }}>
      {/* Theme-specific decorations */}
      {renderDecorations()}

      {/* Content - using explicit heights instead of flexbox auto margins */}
      <div className="relative z-10 h-full flex flex-col p-6">
        {/* Top section - Title & Year (fixed height) */}
        <div className="flex justify-between items-start" style={{ minHeight: '80px' }}>
          <div>
            <div className={`text-sm uppercase tracking-wider mb-1 ${styles.labelClass}`}>
              {highlight.type === 'overall_pnl' ? '2024 WRAPPED' : highlight.type.replace(/_/g, ' ').toUpperCase()}
            </div>
            <h2 className={`text-2xl font-bold flex items-center gap-3 ${theme === 'candy' ? 'text-gray-800' : 'text-white'}`}>
              <span className={styles.valueClass}>
                {(() => {
                  const IconComponent = getHighlightIcon(highlight.type);
                  return <IconComponent />;
                })()}
              </span>
              {highlight.title}
            </h2>
          </div>
          <div className={`text-xl font-bold ${styles.accentClass}`}>
            2024
          </div>
        </div>

        {/* Token ticker if applicable */}
        {highlight.tokenTicker && (
          <div className="flex items-center gap-2 mt-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
              theme === 'candy'
                ? isProfit ? 'bg-green-500 text-white' : isLoss ? 'bg-pink-500 text-white' : 'bg-purple-500 text-white'
                : isProfit ? 'bg-green-500 text-white' : isLoss ? 'bg-pink-500 text-white' : 'bg-purple-500 text-white'
            }`}>
              {highlight.tokenTicker.charAt(0)}
            </div>
            <span className={`text-xl font-semibold ${theme === 'candy' ? 'text-gray-700' : 'text-white'}`}>
              ${highlight.tokenTicker}
            </span>
          </div>
        )}

        {/* Main value - Large and prominent (flex-grow to fill space) */}
        <div className="flex-1 flex flex-col justify-center py-4">
          <div
            className={`font-black ${styles.valueClass}`}
            style={{
              textShadow: theme !== 'candy' ? `0 0 30px currentColor` : 'none',
              fontSize: getValueFontSize(),
              lineHeight: 1.1,
              wordBreak: 'break-word',
            }}
          >
            {highlight.value}
          </div>
          <div className={`text-lg mt-2 font-medium ${styles.subtitleClass}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {highlight.subtitle}
          </div>
        </div>

        {/* Bottom section - Context & Branding (fixed height) */}
        <div style={{ minHeight: '100px' }}>
          <p className={`text-lg mb-4 ${styles.contextClass}`} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {highlight.context}
          </p>

          {/* Branding footer */}
          <div className={`flex justify-between items-center pt-4 border-t ${styles.borderClass}`}>
            <div className={`text-xs font-mono ${theme === 'candy' ? 'text-purple-400' : 'text-gray-400'}`} style={{ maxWidth: '50%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
            </div>
            <div className="flex items-center gap-1">
              <span className={`text-xs ${theme === 'candy' ? 'text-purple-400' : 'text-gray-400'}`}>powered by</span>
              <span className={`font-bold text-sm ${styles.accentClass}`}>$WRAPPED</span>
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
  const [theme, setTheme] = useState<Theme>('holographic');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'success' | 'error'>('idle');
  const [revealedCards, setRevealedCards] = useState<Set<number>>(new Set([0])); // Track which cards have been revealed (start with first card revealed)
  const [sparklingCard, setSparklingCard] = useState<number | null>(null); // Track which card is currently sparkling
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!address) return;
    fetchHighlights();
  }, [address]);

  const fetchHighlights = async (retryCount = 0) => {
    const maxRetries = 3;
    const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Exponential backoff, max 5s

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

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
      setLoading(false);
    } catch (err: any) {
      console.error(`Failed to fetch highlights (attempt ${retryCount + 1}):`, err);

      // Retry if we haven't exceeded max retries
      if (retryCount < maxRetries) {
        console.log(`Retrying in ${retryDelay}ms...`);
        setTimeout(() => fetchHighlights(retryCount + 1), retryDelay);
      } else {
        setError(err.message || 'Failed to load highlights');
        setLoading(false);
      }
    }
  };

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

  const nextCard = () => {
    if (data && currentCard < data.highlights.length - 1) {
      const nextIdx = currentCard + 1;
      setCurrentCard(nextIdx);
      revealCard(nextIdx);
    }
  };

  const prevCard = () => {
    if (currentCard > 0) {
      setCurrentCard(currentCard - 1);
      // Previous cards should already be revealed, but ensure it
      revealCard(currentCard - 1);
    }
  };

  // Handle direct card selection
  const selectCard = (idx: number) => {
    setCurrentCard(idx);
    revealCard(idx);
  };

  // Copy card as image to clipboard
  const copyCardToClipboard = async () => {
    if (!cardRef.current) return;

    setCopyStatus('copying');
    try {
      // Get the actual card element inside the wrapper
      const cardElement = cardRef.current.querySelector('.pnl-card') || cardRef.current;

      const canvas = await html2canvas(cardElement as HTMLElement, {
        backgroundColor: null,
        scale: 3, // Higher quality for better rendering
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: 400,
        height: 520,
        windowWidth: 400,
        windowHeight: 520,
        foreignObjectRendering: false,
        imageTimeout: 0,
        removeContainer: true,
        onclone: (clonedDoc, clonedElement) => {
          const clonedCard = clonedDoc.querySelector('.pnl-card') as HTMLElement;
          if (clonedCard) {
            // Set explicit dimensions
            clonedCard.style.width = '400px';
            clonedCard.style.height = '520px';
            clonedCard.style.minHeight = '520px';
            clonedCard.style.maxWidth = '400px';
            clonedCard.style.position = 'relative';
            clonedCard.style.overflow = 'hidden';

            // Get computed styles from original element
            const originalCard = cardElement as HTMLElement;
            const originalComputedStyle = window.getComputedStyle(originalCard);

            // Copy all background-related styles from original
            clonedCard.style.background = originalComputedStyle.background;
            clonedCard.style.backgroundColor = originalComputedStyle.backgroundColor;
            clonedCard.style.backgroundImage = originalComputedStyle.backgroundImage;
            clonedCard.style.backgroundSize = originalComputedStyle.backgroundSize;
            clonedCard.style.backgroundPosition = originalComputedStyle.backgroundPosition;
            clonedCard.style.backgroundRepeat = originalComputedStyle.backgroundRepeat;
            clonedCard.style.backgroundClip = originalComputedStyle.backgroundClip;
            clonedCard.style.borderRadius = originalComputedStyle.borderRadius;

            // Handle holographic border ::before pseudo-element
            // Since html2canvas doesn't capture pseudo-elements, we need to create a real element
            if (clonedCard.classList.contains('theme-holographic')) {
              const beforePseudo = clonedDoc.createElement('div');
              beforePseudo.style.cssText = `
                content: '';
                position: absolute;
                inset: -2px;
                background: linear-gradient(45deg, #ff0080, #ff8c00, #40e0d0, #ff0080, #7b68ee, #ff0080);
                background-size: 400% 400%;
                border-radius: inherit;
                z-index: -1;
                opacity: 0.8;
                pointer-events: none;
              `;
              clonedCard.insertBefore(beforePseudo, clonedCard.firstChild);
            }

            // Force re-render of all child element backgrounds
            const allElements = clonedCard.querySelectorAll('*');
            allElements.forEach((el: Element) => {
              const htmlEl = el as HTMLElement;
              const originalEl = Array.from(originalCard.querySelectorAll('*')).find(
                (origEl) => origEl.textContent === el.textContent && origEl.className === el.className
              );

              if (originalEl) {
                const computedStyle = window.getComputedStyle(originalEl);
                if (computedStyle.background && computedStyle.background !== 'rgba(0, 0, 0, 0) none repeat scroll 0% 0% / auto padding-box border-box') {
                  htmlEl.style.background = computedStyle.background;
                }
                if (computedStyle.backgroundImage && computedStyle.backgroundImage !== 'none') {
                  htmlEl.style.backgroundImage = computedStyle.backgroundImage;
                }
                if (computedStyle.color) {
                  htmlEl.style.color = computedStyle.color;
                }
              }
            });
          }
        },
      });

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setCopyStatus('error');
          setTimeout(() => setCopyStatus('idle'), 2000);
          return;
        }

        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          setCopyStatus('success');
          setTimeout(() => setCopyStatus('idle'), 2000);
        } catch {
          // Fallback: download the image if clipboard write fails
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `wrapped-${address.slice(0, 8)}-${currentCard + 1}.png`;
          a.click();
          URL.revokeObjectURL(url);
          setCopyStatus('success');
          setTimeout(() => setCopyStatus('idle'), 2000);
        }
      }, 'image/png');
    } catch {
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  // Share card (opens share dialog or shares to X)
  const shareCard = async () => {
    if (!cardRef.current || !data) return;

    const highlight = data.highlights[currentCard];
    const shareText = `My 2024 Solana Wrapped: ${highlight.title} - ${highlight.value}\n\nCheck your wallet at walletwrapped.xyz`;

    // Check if native share is available
    if (navigator.share) {
      try {
        // Get the actual card element inside the wrapper
        const cardElement = cardRef.current.querySelector('.pnl-card') || cardRef.current;

        const canvas = await html2canvas(cardElement as HTMLElement, {
          backgroundColor: null,
          scale: 3,
          useCORS: true,
          allowTaint: true,
          logging: false,
          width: 400,
          height: 520,
          windowWidth: 400,
          windowHeight: 520,
          foreignObjectRendering: false,
          imageTimeout: 0,
          removeContainer: true,
          onclone: (clonedDoc) => {
            const clonedCard = clonedDoc.querySelector('.pnl-card') as HTMLElement;
            if (clonedCard) {
              clonedCard.style.width = '400px';
              clonedCard.style.height = '520px';
              clonedCard.style.minHeight = '520px';
              clonedCard.style.maxWidth = '400px';
              clonedCard.style.position = 'relative';
              clonedCard.style.overflow = 'hidden';

              // Force re-render of backgrounds and gradients
              const allElements = clonedCard.querySelectorAll('*');
              allElements.forEach((el: Element) => {
                const htmlEl = el as HTMLElement;
                const computedStyle = window.getComputedStyle(el);

                // Preserve background styles
                if (computedStyle.background) {
                  htmlEl.style.background = computedStyle.background;
                }
                if (computedStyle.backgroundImage && computedStyle.backgroundImage !== 'none') {
                  htmlEl.style.backgroundImage = computedStyle.backgroundImage;
                }
              });
            }
          },
        });

        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/png');
        });

        const file = new File([blob], 'wrapped.png', { type: 'image/png' });

        await navigator.share({
          title: 'My 2024 Solana Wrapped',
          text: shareText,
          files: [file],
        });
      } catch {
        // Fallback to X share
        shareToX(shareText);
      }
    } else {
      // Fallback to X share
      shareToX(shareText);
    }
  };

  const shareToX = (text: string) => {
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(tweetUrl, '_blank', 'width=550,height=420');
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

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-dark-900">
        <div className="text-center">
          <div className="text-festive-gold mb-6 animate-bounce flex justify-center">
            <Icons.firework />
          </div>
          <div className="spinner w-16 h-16 mx-auto mb-4"></div>
          <p className="text-gray-400">Unwrapping your 2024...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-dark-900">
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
      <main className="min-h-screen flex items-center justify-center px-4 bg-dark-900">
        <div className="max-w-md w-full">
          <div className="card">
            <div className="text-center">
              <div className="text-gray-500 mb-4 flex justify-center">
                <Icons.chart />
              </div>
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
    <main className="min-h-screen py-8 px-4 bg-dark-900">
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
            Failed to copy - image downloaded instead
          </div>
        </div>
      )}

      {/* Background decorations */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-festive-purple/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-festive-pink/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-festive-gold/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-lg mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-festive-gold mb-2 flex justify-center">
            <Icons.firework />
          </div>
          <h1 className="text-3xl font-bold mb-2 text-festive-gold">Your 2024 Wrapped</h1>
          <p className="text-gray-400 text-sm font-mono">{address.slice(0, 8)}...{address.slice(-8)}</p>
        </div>

        {/* Theme Selector */}
        <div className="flex justify-center gap-2 mb-6">
          {(Object.keys(themeInfo) as Theme[]).map((t) => {
            const ThemeIcon = themeInfo[t].icon;
            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                  theme === t
                    ? 'bg-white/20 text-white ring-2 ring-white/50'
                    : 'bg-dark-800 text-gray-400 hover:bg-dark-700 hover:text-white'
                }`}
              >
                <ThemeIcon />
                {themeInfo[t].name}
              </button>
            );
          })}
        </div>

        {/* Card Counter */}
        <div className="text-center mb-4">
          <span className="text-festive-gold font-bold">{currentCard + 1}</span>
          <span className="text-gray-500"> / {data.highlights.length}</span>
        </div>

        {/* PNL Card - wrapped with theme class */}
        <div ref={cardRef} className={`theme-${theme} mb-4 relative`}>
          <PNLCard highlight={highlight} walletAddress={address} theme={theme} />
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
          <button
            onClick={shareCard}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 text-white font-medium transition-all duration-200 shadow-lg hover:shadow-primary-500/25"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
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

        {/* All Highlights Grid - 2 rows of 3 */}
        <div className="grid grid-cols-3 gap-2 mb-8">
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
          <button className="btn-primary w-full flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
            </svg>
            Share on X
          </button>
          <Link href="/" className="btn-secondary w-full text-center">
            Analyze Another Wallet
          </Link>
        </div>
      </div>
    </main>
  );
}

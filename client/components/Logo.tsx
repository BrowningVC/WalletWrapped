'use client';

export default function Logo({ size = 'default' }: { size?: 'small' | 'default' | 'large' }) {
  const sizes = {
    small: { wrapper: 'gap-2', icon: 'w-8 h-8', text: 'text-xl', sparkle: 'text-xs' },
    default: { wrapper: 'gap-3', icon: 'w-12 h-12', text: 'text-3xl', sparkle: 'text-sm' },
    large: { wrapper: 'gap-4', icon: 'w-16 h-16', text: 'text-5xl', sparkle: 'text-base' },
  };

  const s = sizes[size];

  return (
    <div className={`inline-flex items-center ${s.wrapper}`}>
      {/* Logo Icon - Crypto wallet with chart */}
      <div className={`relative ${s.icon}`}>
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          {/* Main wallet shape */}
          <rect x="8" y="16" width="48" height="36" rx="4" fill="url(#walletGradient)" stroke="url(#borderGradient)" strokeWidth="2" />

          {/* Wallet flap/fold */}
          <path d="M8 24 L56 24 L56 20 C56 17.79 54.21 16 52 16 L12 16 C9.79 16 8 17.79 8 20 L8 24Z" fill="url(#flapGradient)" />

          {/* Chart area background */}
          <rect x="12" y="28" width="40" height="20" rx="2" fill="#0a0a12" opacity="0.8" />

          {/* Candlestick chart */}
          {/* Green candle 1 */}
          <rect x="16" y="36" width="4" height="8" fill="#10b981" rx="0.5" />
          <line x1="18" y1="34" x2="18" y2="36" stroke="#10b981" strokeWidth="1.5" />
          <line x1="18" y1="44" x2="18" y2="46" stroke="#10b981" strokeWidth="1.5" />

          {/* Red candle 2 */}
          <rect x="24" y="32" width="4" height="10" fill="#ef4444" rx="0.5" />
          <line x1="26" y1="30" x2="26" y2="32" stroke="#ef4444" strokeWidth="1.5" />
          <line x1="26" y1="42" x2="26" y2="44" stroke="#ef4444" strokeWidth="1.5" />

          {/* Green candle 3 - big pump */}
          <rect x="32" y="30" width="4" height="14" fill="#10b981" rx="0.5" />
          <line x1="34" y1="28" x2="34" y2="30" stroke="#10b981" strokeWidth="1.5" />
          <line x1="34" y1="44" x2="34" y2="46" stroke="#10b981" strokeWidth="1.5" />

          {/* Green candle 4 */}
          <rect x="40" y="32" width="4" height="8" fill="#10b981" rx="0.5" />
          <line x1="42" y1="30" x2="42" y2="32" stroke="#10b981" strokeWidth="1.5" />
          <line x1="42" y1="40" x2="42" y2="42" stroke="#10b981" strokeWidth="1.5" />

          {/* Solana logo hint - simplified */}
          <circle cx="48" cy="22" r="4" fill="url(#solanaGradient)" />
          <path d="M46 21 L50 21 M46 22.5 L50 22.5 M46 24 L50 24" stroke="white" strokeWidth="0.8" strokeLinecap="round" />

          {/* Sparkle effects */}
          <circle cx="14" cy="12" r="2" fill="#ffd700" className="animate-ping" style={{ animationDuration: '2s' }} />
          <circle cx="54" cy="10" r="1.5" fill="#ff6b9d" className="animate-ping" style={{ animationDuration: '2.5s' }} />
          <circle cx="58" cy="38" r="1.5" fill="#9d4edd" className="animate-ping" style={{ animationDuration: '1.8s' }} />

          <defs>
            <linearGradient id="walletGradient" x1="8" y1="16" x2="56" y2="52" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1a1a2e" />
              <stop offset="1" stopColor="#0f0f1a" />
            </linearGradient>
            <linearGradient id="borderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop stopColor="#ffd700" />
              <stop offset="0.5" stopColor="#ff6b9d" />
              <stop offset="1" stopColor="#9d4edd" />
            </linearGradient>
            <linearGradient id="flapGradient" x1="8" y1="16" x2="56" y2="24" gradientUnits="userSpaceOnUse">
              <stop stopColor="#252542" />
              <stop offset="1" stopColor="#1a1a2e" />
            </linearGradient>
            <linearGradient id="solanaGradient" x1="44" y1="18" x2="52" y2="26" gradientUnits="userSpaceOnUse">
              <stop stopColor="#9945FF" />
              <stop offset="1" stopColor="#14F195" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Logo Text */}
      <div className={`font-display font-bold ${s.text} relative`}>
        <span className="text-white">Wallet</span>
        <span className="bg-gradient-to-r from-festive-gold via-festive-pink to-festive-purple bg-clip-text text-transparent">Wrapped</span>
        {/* Sparkle decoration */}
        <span className={`absolute -top-1 -right-3 ${s.sparkle} text-festive-gold animate-pulse`}>✦</span>
      </div>
    </div>
  );
}

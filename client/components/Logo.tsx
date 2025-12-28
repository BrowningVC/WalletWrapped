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
      {/* Logo Icon - Calendar Year in Review */}
      <div className={`relative ${s.icon}`}>
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          {/* Calendar base */}
          <rect x="10" y="14" width="44" height="40" rx="4" fill="url(#calendarGradient)" stroke="url(#borderGradient)" strokeWidth="2" />

          {/* Calendar header bar */}
          <rect x="10" y="14" width="44" height="10" rx="4" fill="url(#headerGradient)" />
          <rect x="10" y="20" width="44" height="4" fill="url(#headerGradient)" />

          {/* Calendar rings/binding */}
          <rect x="18" y="10" width="3" height="8" rx="1.5" fill="url(#borderGradient)" />
          <rect x="31" y="10" width="3" height="8" rx="1.5" fill="url(#borderGradient)" />
          <rect x="44" y="10" width="3" height="8" rx="1.5" fill="url(#borderGradient)" />

          {/* Calendar grid - simplified week view */}
          <line x1="14" y1="28" x2="50" y2="28" stroke="#2a2a3e" strokeWidth="0.5" />
          <line x1="14" y1="34" x2="50" y2="34" stroke="#2a2a3e" strokeWidth="0.5" />
          <line x1="14" y1="40" x2="50" y2="40" stroke="#2a2a3e" strokeWidth="0.5" />
          <line x1="14" y1="46" x2="50" y2="46" stroke="#2a2a3e" strokeWidth="0.5" />

          <line x1="20" y1="24" x2="20" y2="50" stroke="#2a2a3e" strokeWidth="0.5" />
          <line x1="26" y1="24" x2="26" y2="50" stroke="#2a2a3e" strokeWidth="0.5" />
          <line x1="32" y1="24" x2="32" y2="50" stroke="#2a2a3e" strokeWidth="0.5" />
          <line x1="38" y1="24" x2="38" y2="50" stroke="#2a2a3e" strokeWidth="0.5" />
          <line x1="44" y1="24" x2="44" y2="50" stroke="#2a2a3e" strokeWidth="0.5" />

          {/* Highlighted days - trading activity indicators */}
          <circle cx="17" cy="31" r="2" fill="#10b981" opacity="0.8" />
          <circle cx="23" cy="31" r="2" fill="#ffd700" opacity="0.8" />
          <circle cx="35" cy="37" r="2" fill="#ff6b9d" opacity="0.8" />
          <circle cx="41" cy="37" r="2" fill="#10b981" opacity="0.8" />
          <circle cx="29" cy="43" r="2" fill="#9d4edd" opacity="0.8" />
          <circle cx="47" cy="43" r="2" fill="#ffd700" opacity="0.8" />

          {/* Chart trend line overlay - year performance */}
          <path
            d="M 14 48 L 20 44 L 26 46 L 32 38 L 38 40 L 44 35 L 50 32"
            stroke="url(#trendGradient)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity="0.6"
          />

          {/* Sparkle effects - festive touches */}
          <circle cx="56" cy="12" r="2" fill="#ffd700" className="animate-ping" style={{ animationDuration: '2s' }} />
          <circle cx="8" cy="18" r="1.5" fill="#ff6b9d" className="animate-ping" style={{ animationDuration: '2.5s' }} />
          <circle cx="54" cy="52" r="1.5" fill="#9d4edd" className="animate-ping" style={{ animationDuration: '1.8s' }} />

          <defs>
            <linearGradient id="calendarGradient" x1="10" y1="14" x2="54" y2="54" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1a1a2e" />
              <stop offset="1" stopColor="#0f0f1a" />
            </linearGradient>
            <linearGradient id="headerGradient" x1="10" y1="14" x2="54" y2="24" gradientUnits="userSpaceOnUse">
              <stop stopColor="#2a2a42" />
              <stop offset="1" stopColor="#1a1a2e" />
            </linearGradient>
            <linearGradient id="borderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop stopColor="#ffd700" />
              <stop offset="0.5" stopColor="#ff6b9d" />
              <stop offset="1" stopColor="#9d4edd" />
            </linearGradient>
            <linearGradient id="trendGradient" x1="14" y1="32" x2="50" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor="#10b981" />
              <stop offset="0.5" stopColor="#ffd700" />
              <stop offset="1" stopColor="#ff6b9d" />
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

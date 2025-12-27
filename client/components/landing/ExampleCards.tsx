'use client';

// Icons for each card type
const icons = {
  biggest_win: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  best_trade: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  diamond_hands: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const exampleHighlights = [
  {
    type: 'biggest_win',
    title: 'Biggest Win',
    description: 'Your most profitable token',
    value: '+45.2 SOL',
    gradient: 'from-profit-500 to-emerald-400',
    iconColor: 'text-profit-500',
    borderColor: 'border-profit-500/30',
    glowColor: 'group-hover:shadow-[0_0_30px_rgba(16,185,129,0.2)]',
  },
  {
    type: 'best_trade',
    title: 'Best Trade',
    description: 'Highest return on single trade',
    value: '+1,247%',
    gradient: 'from-festive-gold to-festive-pink',
    iconColor: 'text-festive-gold',
    borderColor: 'border-festive-gold/30',
    glowColor: 'group-hover:shadow-[0_0_30px_rgba(255,215,0,0.2)]',
  },
  {
    type: 'diamond_hands',
    title: 'Diamond Hands',
    description: 'Longest held position',
    value: '247 days',
    gradient: 'from-festive-purple to-festive-pink',
    iconColor: 'text-festive-purple',
    borderColor: 'border-festive-purple/30',
    glowColor: 'group-hover:shadow-[0_0_30px_rgba(157,78,221,0.2)]',
  },
];

export default function ExampleCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
      {exampleHighlights.map((card, index) => (
        <div
          key={card.type}
          className={`nye-card rounded-xl p-6 group cursor-pointer transition-all duration-300 hover:border-opacity-60 ${card.glowColor} animate-slide-up`}
          style={{ animationDelay: `${index * 100}ms` }}
        >
          {/* Gradient header bar */}
          <div className={`h-1 w-full bg-gradient-to-r ${card.gradient} rounded-full mb-5`} />

          {/* Card content */}
          <div className="text-center">
            {/* Icon + Title */}
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className={card.iconColor}>
                {icons[card.type as keyof typeof icons]}
              </span>
              <h3 className="text-xl font-bold text-white group-hover:scale-105 transition-transform">
                {card.title}
              </h3>
            </div>

            <p className="text-gray-500 text-sm mb-4">{card.description}</p>

            <div className={`text-4xl font-bold bg-gradient-to-r ${card.gradient} bg-clip-text text-transparent`}>
              {card.value}
            </div>
          </div>

          {/* Share hint */}
          <div className="mt-6 pt-4 border-t border-dark-600 flex items-center justify-center gap-2 text-xs text-gray-600 group-hover:text-gray-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span>Share on X</span>
          </div>
        </div>
      ))}
    </div>
  );
}

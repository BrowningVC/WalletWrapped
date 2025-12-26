'use client';

import Image from 'next/image';

const exampleHighlights = [
  {
    type: 'biggest_win',
    title: 'Biggest Win 🚀',
    description: 'Your most profitable token',
    value: '+45.2 SOL',
    gradient: 'from-profit-500 to-profit-600',
  },
  {
    type: 'best_trade',
    title: 'Best Trade 🎯',
    description: 'Highest return on single trade',
    value: '+1,247%',
    gradient: 'from-yellow-500 to-orange-500',
  },
  {
    type: 'diamond_hands',
    title: 'Diamond Hands 💎',
    description: 'Longest held position',
    value: '247 days',
    gradient: 'from-blue-500 to-cyan-500',
  },
];

export default function ExampleCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
      {exampleHighlights.map((card, index) => (
        <div
          key={card.type}
          className="card-hover group animate-slide-up"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          {/* Gradient header */}
          <div className={`h-3 w-full bg-gradient-to-r ${card.gradient} rounded-t-xl mb-4 -mt-6 -mx-6`} />

          {/* Card content */}
          <div className="text-center">
            <h3 className="text-2xl font-bold mb-2 group-hover:scale-110 transition-transform">
              {card.title}
            </h3>
            <p className="text-gray-400 text-sm mb-4">{card.description}</p>

            <div className={`text-4xl font-bold bg-gradient-to-r ${card.gradient} bg-clip-text text-transparent`}>
              {card.value}
            </div>
          </div>

          {/* Share icon hint */}
          <div className="mt-6 pt-4 border-t border-gray-700 flex items-center justify-center gap-2 text-xs text-gray-500">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
            </svg>
            <span>Share on Twitter</span>
          </div>
        </div>
      ))}
    </div>
  );
}

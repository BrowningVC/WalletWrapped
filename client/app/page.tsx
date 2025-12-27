'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import WalletInput from '@/components/landing/WalletInput';
import ExampleCards from '@/components/landing/ExampleCards';
import Features from '@/components/landing/Features';
import WalletCounter from '@/components/WalletCounter';
import Fireworks from '@/components/Fireworks';
import Logo from '@/components/Logo';

export default function HomePage() {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = (address: string) => {
    setIsAnalyzing(true);
    router.push(`/analyze/${address}`);
  };

  return (
    <main className="min-h-screen bg-dark-950">
      {/* Fireworks background effect */}
      <Fireworks />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Dark gradient background */}
        <div className="absolute inset-0 bg-gradient-radial from-dark-800/30 via-dark-950 to-dark-950" />

        {/* Subtle ambient glow orbs */}
        <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-festive-gold/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-20 right-1/4 w-[400px] h-[400px] bg-festive-pink/5 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/5 rounded-full blur-[120px]" />

        <div className="relative container mx-auto px-4 py-12 sm:py-20">
          <div className="max-w-4xl mx-auto text-center">
            {/* Logo at the top with counter directly underneath - centered */}
            <div className="mb-10 animate-slide-down-simple">
              <div className="flex justify-center">
                <Logo size="large" />
              </div>
              {/* Live Wallet Counter - centered under logo */}
              <div className="mt-4 animate-fade-in flex justify-center" style={{ animationDelay: '0.3s' }}>
                <WalletCounter showActive={true} />
              </div>
            </div>

            {/* Main heading with festive styling */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 animate-slide-up text-balance">
              <span className="text-white">Unwrap Your </span>
              <span className="nye-shimmer">2024</span>
              <br />
              <span className="festive-gradient-text">Solana Trading Year</span>
            </h1>

            <p className="text-xl sm:text-2xl text-gray-400 mb-12 max-w-2xl mx-auto animate-slide-up delay-100">
              Get shareable highlight cards and detailed analytics for any Solana wallet.
              No login required.
            </p>

            {/* Wallet input */}
            <div className="max-w-2xl mx-auto animate-slide-up delay-200">
              <WalletInput onAnalyze={handleAnalyze} isLoading={isAnalyzing} />
            </div>

            {/* Stats */}
            <div className="mt-12 grid grid-cols-3 gap-8 max-w-2xl mx-auto animate-fade-in delay-400">
              <div className="text-center">
                <div className="text-3xl font-bold text-festive-gold">6</div>
                <div className="text-sm text-gray-500 mt-1">Highlight Cards</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-festive-pink">&lt;60s</div>
                <div className="text-sm text-gray-500 mt-1">Analysis Time</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-festive-purple">100%</div>
                <div className="text-sm text-gray-500 mt-1">Free Forever</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Example Cards Section */}
      <section className="py-20 bg-dark-900/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              <span className="text-white">See Your Trading </span>
              <span className="festive-gradient-text">Highlights</span>
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              Get shareable cards showcasing your biggest wins, best trades, and more
            </p>
          </div>

          <ExampleCards />
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-dark-950">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              <span className="text-white">Why </span>
              <span className="festive-gradient-text">WalletWrapped?</span>
            </h2>
          </div>

          <Features />
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-dark-900/50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6 text-white">
              Ready to unwrap your trading year?
            </h2>
            <p className="text-lg text-gray-500 mb-8">
              Paste any Solana wallet address to get started
            </p>

            <div className="max-w-2xl mx-auto">
              <WalletInput onAnalyze={handleAnalyze} isLoading={isAnalyzing} />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-dark-700 py-12 bg-dark-950">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <Logo size="small" />

            <div className="flex gap-6 text-sm text-gray-500">
              <a href="https://github.com/BrowningVC/WalletWrapped" target="_blank" rel="noopener noreferrer" className="hover:text-festive-gold transition-colors">
                GitHub
              </a>
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="hover:text-festive-gold transition-colors">
                Twitter
              </a>
              <a href="https://helius.dev" target="_blank" rel="noopener noreferrer" className="hover:text-festive-gold transition-colors">
                Built with Helius
              </a>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-dark-700 text-center text-sm text-gray-600">
            <p>&copy; {new Date().getFullYear()} WalletWrapped. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

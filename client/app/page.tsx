'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import WalletInput from '@/components/landing/WalletInput';
import ExampleCards from '@/components/landing/ExampleCards';
import Features from '@/components/landing/Features';

export default function HomePage() {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = (address: string) => {
    setIsAnalyzing(true);
    router.push(`/analyze/${address}`);
  };

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-radial from-primary-900/20 via-dark-900 to-dark-900" />

        {/* Animated gradient orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary-500/10 rounded-full blur-3xl animate-pulse-glow delay-1000" />

        <div className="relative container mx-auto px-4 py-20 sm:py-32">
          <div className="max-w-4xl mx-auto text-center">
            {/* Logo/Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-dark-800 border border-gray-700 rounded-full mb-8 animate-slide-down">
              <span className="w-2 h-2 bg-accent-500 rounded-full animate-pulse" />
              <span className="text-sm text-gray-300">Powered by Helius & Solana</span>
            </div>

            {/* Main heading */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 animate-slide-up">
              Unwrap Your{' '}
              <span className="gradient-text">
                Solana Trading Year
              </span>
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
            <div className="mt-12 grid grid-cols-3 gap-8 max-w-2xl mx-auto animate-fade-in delay-300">
              <div>
                <div className="text-3xl font-bold gradient-text">12</div>
                <div className="text-sm text-gray-400 mt-1">Highlight Cards</div>
              </div>
              <div>
                <div className="text-3xl font-bold gradient-text">&lt;15s</div>
                <div className="text-sm text-gray-400 mt-1">Analysis Time</div>
              </div>
              <div>
                <div className="text-3xl font-bold gradient-text">100%</div>
                <div className="text-sm text-gray-400 mt-1">Free Forever</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Example Cards Section */}
      <section className="py-20 bg-dark-800/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              See Your Trading{' '}
              <span className="gradient-text">Highlights</span>
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Get Twitter-optimized cards showcasing your biggest wins, best trades, and more
            </p>
          </div>

          <ExampleCards />
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Why{' '}
              <span className="gradient-text">WalletWrapped?</span>
            </h2>
          </div>

          <Features />
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-dark-800/50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">
              Ready to unwrap your trading year?
            </h2>
            <p className="text-lg text-gray-400 mb-8">
              Paste any Solana wallet address to get started
            </p>

            <div className="max-w-2xl mx-auto">
              <WalletInput onAnalyze={handleAnalyze} isLoading={isAnalyzing} />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-center md:text-left">
              <div className="text-xl font-bold gradient-text mb-2">WalletWrapped</div>
              <p className="text-sm text-gray-400">
                Your Solana trading year in review
              </p>
            </div>

            <div className="flex gap-6 text-sm text-gray-400">
              <a href="https://github.com/BrowningVC/WalletWrapped" target="_blank" rel="noopener noreferrer" className="hover:text-primary-500 transition-colors">
                GitHub
              </a>
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="hover:text-primary-500 transition-colors">
                Twitter
              </a>
              <a href="https://helius.dev" target="_blank" rel="noopener noreferrer" className="hover:text-primary-500 transition-colors">
                Built with Helius
              </a>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-800 text-center text-sm text-gray-500">
            <p>&copy; {new Date().getFullYear()} WalletWrapped. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

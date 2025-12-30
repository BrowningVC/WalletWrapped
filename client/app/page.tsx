'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import WalletInput from '@/components/landing/WalletInput';
import Fireworks from '@/components/Fireworks';
import Logo from '@/components/Logo';
import StatsTicker from '@/components/StatsTicker';

export default function HomePage() {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Token contract address - update this when you have one
  const tokenContract = 'COMING_SOON';

  const handleAnalyze = (address: string) => {
    setIsAnalyzing(true);
    router.push(`/analyze/${address}`);
  };

  const copyTokenContract = async () => {
    if (tokenContract === 'COMING_SOON') return;

    try {
      await navigator.clipboard.writeText(tokenContract);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <main className="min-h-screen bg-dark-950">
      {/* Stats Ticker Bar */}
      <StatsTicker />

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
            {/* Logo at the top */}
            <div className="mb-10 animate-slide-down-simple">
              <div className="flex justify-center">
                <Logo size="large" />
              </div>
            </div>

            {/* Main heading with festive styling */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 animate-slide-up text-balance">
              <span className="text-white">Your Year In The</span>
              <br />
              <span className="festive-gradient-text">Trenches</span>
              {' '}
              <span className="festive-gradient-text">Wrapped</span>
            </h1>

            <p className="text-xl sm:text-2xl text-gray-400 mb-12 max-w-2xl mx-auto animate-slide-up delay-100">
              Instantly generated PNL highlight cards. No login required.
            </p>

            {/* Wallet input */}
            <div className="max-w-2xl mx-auto animate-slide-up delay-200">
              <WalletInput onAnalyze={handleAnalyze} isLoading={isAnalyzing} />
            </div>

            {/* Token Contract Section - moved below analyze button */}
            <div className="mt-8 max-w-xl mx-auto animate-slide-up delay-300">
              <h3 className="text-lg font-semibold mb-3 text-center">
                <span className="festive-gradient-text">$WRAPPED</span>
                <span className="text-white"> Token</span>
              </h3>

              <div className="flex items-center gap-2 bg-dark-800/50 border border-dark-700 rounded-lg p-3 hover:border-festive-gold/30 transition-colors">
                <div className="flex-1 text-left font-mono text-sm text-gray-400 overflow-x-auto">
                  {tokenContract}
                </div>

                <button
                  onClick={copyTokenContract}
                  disabled={tokenContract === 'COMING_SOON'}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-2 text-sm ${
                    tokenContract === 'COMING_SOON'
                      ? 'bg-dark-700 text-gray-500 cursor-not-allowed'
                      : copied
                      ? 'bg-festive-gold/20 text-festive-gold'
                      : 'bg-festive-gold/10 text-festive-gold hover:bg-festive-gold/20'
                  }`}
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-12 grid grid-cols-3 gap-8 max-w-2xl mx-auto animate-fade-in delay-400">
              <div className="text-center">
                <div className="text-3xl font-bold text-festive-gold">7</div>
                <div className="text-sm text-gray-500 mt-1">Highlight Cards</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-festive-pink">15s</div>
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

      {/* Footer */}
      <footer className="border-t border-dark-700 py-12 bg-dark-950">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <Logo size="small" />

            <div className="flex gap-6 text-sm text-gray-500">
              <a href="https://x.com/WalletWrapped" target="_blank" rel="noopener noreferrer" className="hover:text-festive-gold transition-colors">
                Twitter/X
              </a>
              <a href="https://helius.dev" target="_blank" rel="noopener noreferrer" className="hover:text-festive-gold transition-colors">
                Powered by Helius
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

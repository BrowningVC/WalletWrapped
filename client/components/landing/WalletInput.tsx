'use client';

import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';

interface WalletInputProps {
  onAnalyze: (address: string) => void;
  isLoading?: boolean;
}

export default function WalletInput({ onAnalyze, isLoading = false }: WalletInputProps) {
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');

  const validateAddress = (addr: string): boolean => {
    if (!addr.trim()) {
      setError('Please enter a wallet address');
      return false;
    }

    try {
      const pubkey = new PublicKey(addr.trim());
      if (!PublicKey.isOnCurve(pubkey.toBuffer())) {
        setError('Invalid Solana address');
        return false;
      }
      return true;
    } catch {
      setError('Invalid Solana address format');
      return false;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedAddress = address.trim();
    if (validateAddress(trimmedAddress)) {
      onAnalyze(trimmedAddress);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setAddress(text.trim());
      setError('');
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };

  const handleClear = () => {
    setAddress('');
    setError('');
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <input
          type="text"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setError('');
          }}
          placeholder="Paste Solana wallet address (e.g., 7Np...xyz)"
          className={`w-full px-4 py-4 bg-dark-900/80 border-2 border-festive-gold/40 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:border-festive-gold focus:ring-4 focus:ring-festive-gold/20 transition-all pr-32 shadow-[0_0_20px_rgba(255,215,0,0.15)] hover:shadow-[0_0_25px_rgba(255,215,0,0.25)] hover:border-festive-gold/60 ${error ? 'border-loss-500 focus:ring-loss-500/20 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : ''}`}
          disabled={isLoading}
          autoComplete="off"
          spellCheck={false}
        />

        {/* Action buttons inside input */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {address && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="p-2 text-gray-400 hover:text-gray-200 transition-colors"
              title="Clear"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={handlePaste}
            className="p-2 text-gray-400 hover:text-primary-500 transition-colors"
            title="Paste"
            disabled={isLoading}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-2 text-sm text-loss-500 flex items-center gap-2 animate-slide-down">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={isLoading || !address}
        className="w-full mt-4 py-4 px-6 rounded-xl font-semibold text-dark-900 bg-gradient-to-r from-festive-gold via-festive-pink to-festive-purple hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
      >
        {isLoading ? (
          <>
            <div className="spinner w-5 h-5 mr-2" />
            Analyzing...
          </>
        ) : (
          <>
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Analyze Wallet
          </>
        )}
      </button>

    </form>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

interface ProgressData {
  percent: number;
  message: string;
  timestamp: string;
}

export default function AnalyzePage() {
  const params = useParams();
  const router = useRouter();
  const address = params.address as string;

  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Initializing analysis...');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!address) return;

    // Start analysis
    startAnalysis();

    // Connect to Socket.io
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      // Subscribe to progress updates for this wallet
      newSocket.emit('subscribe', { walletAddress: address });
    });

    newSocket.on('progress', (data: ProgressData) => {
      console.log('Progress update:', data);
      setProgress(data.percent);
      setStatusMessage(data.message);
    });

    newSocket.on('complete', (data) => {
      console.log('Analysis complete:', data);
      setProgress(100);
      setStatusMessage('Analysis complete! Redirecting...');

      // Redirect to highlights page
      setTimeout(() => {
        router.push(`/highlights/${address}`);
      }, 1500);
    });

    newSocket.on('error', (data) => {
      console.error('Analysis error:', data);
      setError(data.message || 'Analysis failed');
      setProgress(0);
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    setSocket(newSocket);

    // Cleanup
    return () => {
      if (newSocket) {
        newSocket.emit('unsubscribe', { walletAddress: address });
        newSocket.disconnect();
      }
    };
  }, [address, router]);

  const startAnalysis = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to start analysis');
      }

      console.log('Analysis started:', data);

      // If already completed (cached)
      if (data.status === 'completed') {
        setProgress(100);
        setStatusMessage('Analysis complete!');
        setTimeout(() => {
          router.push(`/highlights/${address}`);
        }, 1000);
      }
    } catch (err: any) {
      console.error('Failed to start analysis:', err);
      setError(err.message || 'Failed to start analysis');
    }
  };

  const handleCancel = () => {
    router.push('/');
  };

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="card border-loss-500">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-loss-500/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-loss-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold mb-2">Analysis Failed</h2>
              <p className="text-gray-400 mb-6">{error}</p>

              <button onClick={handleCancel} className="btn-primary">
                Try Another Wallet
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-2xl w-full">
        <div className="card animate-slide-up">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Analyzing Wallet</h1>
            <p className="text-gray-400 text-sm font-mono break-all">{address}</p>
          </div>

          {/* Progress Circle */}
          <div className="relative w-48 h-48 mx-auto mb-8">
            {/* Background circle */}
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="96"
                cy="96"
                r="88"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-dark-700"
              />
              <circle
                cx="96"
                cy="96"
                r="88"
                stroke="url(#gradient)"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 88}`}
                strokeDashoffset={`${2 * Math.PI * 88 * (1 - progress / 100)}`}
                className="transition-all duration-500 ease-out"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#667eea" />
                  <stop offset="100%" stopColor="#764ba2" />
                </linearGradient>
              </defs>
            </svg>

            {/* Percentage text */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl font-bold gradient-text">
                  {Math.round(progress)}%
                </div>
              </div>
            </div>
          </div>

          {/* Status message */}
          <div className="text-center mb-8">
            <p className="text-lg text-gray-300 animate-pulse">
              {statusMessage}
            </p>
          </div>

          {/* Progress bar */}
          <div className="progress-bar mb-6">
            <div
              className="progress-bar-fill"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Info boxes */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-dark-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-primary-500">~15s</div>
              <div className="text-sm text-gray-400 mt-1">Average Time</div>
            </div>
            <div className="bg-dark-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-accent-500">12</div>
              <div className="text-sm text-gray-400 mt-1">Highlights</div>
            </div>
          </div>

          {/* Cancel button */}
          <button onClick={handleCancel} className="btn-ghost w-full">
            Cancel
          </button>
        </div>

        {/* What's being analyzed */}
        <div className="mt-8 card">
          <h3 className="font-bold mb-4">What we're analyzing:</h3>
          <ul className="space-y-2 text-sm text-gray-400">
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Fetching all transactions from Solana blockchain</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Calculating P&L with FIFO cost basis method</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Tracking realized and unrealized gains/losses</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Generating shareable highlight cards</span>
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}

'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { io, Socket } from 'socket.io-client';
import WalletCounter from '@/components/WalletCounter';
import Fireworks from '@/components/Fireworks';
import Logo from '@/components/Logo';

// Transaction block flowing animation
function TransactionStream({ isActive }: { isActive: boolean }) {
  const [blocks, setBlocks] = useState<{ id: number; delay: number; width: number }[]>([]);

  useEffect(() => {
    setBlocks(
      Array.from({ length: 8 }, (_, i) => ({
        id: i,
        delay: i * 0.3,
        width: 20 + Math.random() * 40,
      }))
    );
  }, []);

  if (!isActive || blocks.length === 0) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 h-16 overflow-hidden opacity-60">
      <div className="relative h-full">
        {blocks.map((block) => (
          <div
            key={block.id}
            className="absolute h-2 rounded-full bg-gradient-to-r from-festive-gold via-festive-pink to-festive-purple"
            style={{
              width: block.width,
              left: '-50px',
              top: `${10 + block.id * 6}px`,
              animation: `stream-flow 2s linear ${block.delay}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Particle burst on stage completion
function StageBurst({ trigger }: { trigger: number }) {
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string }[]>([]);

  useEffect(() => {
    if (trigger > 1) {
      const newParticles = Array.from({ length: 12 }, (_, i) => ({
        id: Date.now() + i,
        x: Math.random() * 100 - 50,
        y: Math.random() * 100 - 50,
        color: ['#ffd700', '#ff6b9d', '#9d4edd', '#10b981'][Math.floor(Math.random() * 4)],
      }));
      setParticles(newParticles);
      setTimeout(() => setParticles([]), 600);
    }
  }, [trigger]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute w-2 h-2 rounded-full"
          style={{
            left: '50%',
            top: '50%',
            backgroundColor: p.color,
            animation: 'particle-burst 0.6s ease-out forwards',
            '--tx': `${p.x}px`,
            '--ty': `${p.y}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

interface ProgressData {
  percent: number;
  message: string;
  timestamp: string;
  stage?: string;
  stageLabel?: string;
  currentStep?: number;
  totalSteps?: number;
  transactionsFetched?: number | null;
  transactionsTotal?: number | null;
  transactionsProcessed?: number | null;
  startTime?: number | null;
}

// Analysis stage definitions
const stageConfig = [
  { key: 'initializing', label: 'Initializing', description: 'Setting up analysis' },
  { key: 'fetching', label: 'Fetching', description: 'Downloading transactions from Solana' },
  { key: 'parsing', label: 'Parsing', description: 'Processing transaction data' },
  { key: 'calculating', label: 'Calculating', description: 'Computing P&L - this may take a moment for large wallets' },
  { key: 'saving', label: 'Saving', description: 'Storing results in database' },
  { key: 'highlights', label: 'Highlights', description: 'Generating your wrapped cards' },
];

// Progress encouragement messages that rotate every 5 seconds
const progressMessages = [
  "Crunching the numbers...",
  "Almost there, hang tight...",
  "Processing your trades...",
  "Getting closer...",
  "Just a bit longer...",
  "Finalizing calculations...",
  "Wrapping up your results...",
  "Nearly done...",
  "Polishing the details...",
  "Working hard on this...",
];

export default function AnalyzePage() {
  const params = useParams();
  const router = useRouter();
  const address = params.address as string;

  const [progress, setProgress] = useState(0);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Initializing analysis...');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [error, setError] = useState('');

  const [currentStage, setCurrentStage] = useState('initializing');
  const [currentStep, setCurrentStep] = useState(1);
  const [transactionsFetched, setTransactionsFetched] = useState<number | null>(null);
  const [transactionsTotal, setTransactionsTotal] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const [progressMessageIndex, setProgressMessageIndex] = useState(0);

  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      setSecondsSinceUpdate(Math.floor((Date.now() - lastUpdateTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, lastUpdateTime]);

  // Rotate progress messages every 5 seconds when analysis is taking a while
  useEffect(() => {
    if (secondsSinceUpdate < 10) return; // Only show messages if update is taking a while

    const interval = setInterval(() => {
      setProgressMessageIndex((prev) => (prev + 1) % progressMessages.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [secondsSinceUpdate]);

  useEffect(() => {
    if (displayProgress >= progress) return;

    const step = Math.max(0.5, (progress - displayProgress) / 20);
    const interval = setInterval(() => {
      setDisplayProgress(prev => {
        const next = prev + step;
        if (next >= progress) {
          clearInterval(interval);
          return progress;
        }
        return next;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [progress, displayProgress]);

  // Fallback polling for status when WebSocket events don't arrive
  useEffect(() => {
    if (!address || progress === 100 || error) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
    let pollCount = 0;
    const maxPolls = 120; // 2 minutes max polling

    const pollStatus = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/analyze/${address}/status`);
        if (!response.ok) return;

        const data = await response.json();
        console.log('Poll status:', data);

        if (data.status === 'completed') {
          setProgress(100);
          setCurrentStage('completing');
          setCurrentStep(6);
          setStatusMessage('Analysis complete! Redirecting...');
          router.push(`/highlights/${address}`);
          return;
        }

        if (data.status === 'failed') {
          setError(data.error || 'Analysis failed');
          return;
        }

        // Update progress from polling if WebSocket isn't delivering
        if (data.progress > progress) {
          setProgress(data.progress);
          setStatusMessage(data.message || 'Processing...');
          setLastUpdateTime(Date.now());
        }
      } catch (err) {
        console.error('Poll status error:', err);
      }
    };

    // Poll every 3 seconds as fallback
    const pollInterval = setInterval(() => {
      pollCount++;
      if (pollCount > maxPolls) {
        clearInterval(pollInterval);
        return;
      }
      pollStatus();
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [address, progress, error, router]);

  useEffect(() => {
    if (!address) return;

    startAnalysis();
    setStartTime(Date.now());

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3002';
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      newSocket.emit('subscribe', { walletAddress: address });
    });

    newSocket.on('progress', (data: ProgressData) => {
      console.log('Progress update:', data);
      setProgress(data.percent);
      setStatusMessage(data.message);
      setLastUpdateTime(Date.now()); // Reset activity timer on each progress update

      if (data.stage) setCurrentStage(data.stage);
      if (data.currentStep !== undefined && data.currentStep !== null) setCurrentStep(data.currentStep);
      if (data.transactionsFetched !== undefined) setTransactionsFetched(data.transactionsFetched);
      if (data.transactionsTotal !== undefined) setTransactionsTotal(data.transactionsTotal);
      if (data.startTime && !startTime) setStartTime(data.startTime);
    });

    newSocket.on('complete', (data) => {
      console.log('Analysis complete:', data);
      setProgress(100);
      setCurrentStage('completing');
      setCurrentStep(6);
      setStatusMessage('Analysis complete! Redirecting...');

      // Prefetch the highlights page for instant navigation
      router.prefetch(`/highlights/${address}`);

      // Start preloading the first card image immediately
      // This warms up the edge cache so the image is ready when the user arrives
      const img = new Image();
      img.src = `/api/card/${address}/0`;

      // Redirect after a brief moment to show completion state
      // The card image will continue loading in background
      setTimeout(() => {
        router.push(`/highlights/${address}`);
      }, 300);
    });

    newSocket.on('error', (data) => {
      console.error('Analysis error:', data);
      setError(data.error || data.message || 'Analysis failed');
      setProgress(0);
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    setSocket(newSocket);

    return () => {
      if (newSocket) {
        newSocket.emit('unsubscribe', { walletAddress: address });
        newSocket.disconnect();
      }
    };
  }, [address, router]);

  const startAnalysis = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

      // First, fetch CSRF token
      const csrfResponse = await fetch(`${apiUrl}/api/csrf-token`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!csrfResponse.ok) {
        throw new Error('Failed to get CSRF token');
      }

      const csrfData = await csrfResponse.json();
      const csrfToken = csrfData.csrfToken;

      // Now make the analyze request with CSRF token
      const response = await fetch(`${apiUrl}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({ walletAddress: address }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to start analysis');
      }

      console.log('Analysis started:', data);

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
    if (socket) {
      socket.emit('unsubscribe', { walletAddress: address });
      socket.disconnect();
    }
    router.push('/');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const formatNumber = (num: number | null) => {
    if (num === null) return '-';
    return num.toLocaleString();
  };

  const currentStageIndex = Math.max(0, currentStep - 1);

  if (error) {
    return (
      <main className="min-h-screen bg-dark-950 flex items-center justify-center px-4 relative overflow-hidden">
        {/* Background effects */}
        <Fireworks />
        <div className="absolute inset-0 bg-gradient-radial from-dark-800/30 via-dark-950 to-dark-950" />
        <div className="absolute top-20 left-1/4 w-[400px] h-[400px] bg-loss-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-20 right-1/4 w-[300px] h-[300px] bg-festive-pink/5 rounded-full blur-[100px]" />

        <div className="max-w-md w-full relative z-10">
          <div className="bg-dark-900/80 backdrop-blur-md border border-loss-500/30 rounded-2xl p-8">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-loss-500/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-loss-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold mb-2 text-white">Analysis Failed</h2>
              <p className="text-gray-400 mb-6">{error}</p>

              <button
                onClick={handleCancel}
                className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-festive-gold via-festive-pink to-festive-purple text-white font-semibold hover:opacity-90 transition-opacity"
              >
                Try Another Wallet
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-dark-950 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Fireworks background effect */}
      <Fireworks />

      {/* Dark gradient background */}
      <div className="absolute inset-0 bg-gradient-radial from-dark-800/30 via-dark-950 to-dark-950" />

      {/* Subtle ambient glow orbs - matching landing page */}
      <div className="absolute top-20 left-1/4 w-[400px] h-[400px] bg-festive-gold/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-20 right-1/4 w-[300px] h-[300px] bg-festive-pink/5 rounded-full blur-[100px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-festive-purple/5 rounded-full blur-[120px]" />

      <div className="max-w-2xl w-full relative z-10">
        {/* Header with logo and counter */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo size="small" />
          </Link>
          <WalletCounter variant="compact" showActive={true} />
        </div>

        {/* Main card */}
        <div className="bg-dark-900/80 backdrop-blur-md border border-dark-700/50 rounded-2xl p-8 animate-slide-up relative overflow-hidden">
          {/* Transaction stream effect during fetching/parsing */}
          <TransactionStream isActive={progress >= 5 && progress < 50} />

          {/* Stage completion burst */}
          <StageBurst trigger={currentStep} />

          {/* Time estimate banner */}
          <div className="bg-festive-gold/10 border border-festive-gold/20 rounded-xl p-4 mb-6 text-center">
            <div className="flex items-center justify-center gap-2 text-festive-gold">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">Analysis typically takes 15-60 seconds</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Duration depends on wallet transaction history</p>
          </div>

          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold mb-2">
              <span className="text-white">Unwrapping </span>
              <span className="festive-gradient-text">Wallet</span>
            </h1>
            <p className="text-gray-400 text-sm font-mono break-all bg-dark-800/50 rounded-lg px-3 py-2 inline-block">{address}</p>
          </div>

          {/* Progress Circle */}
          <div className="relative w-48 h-48 mx-auto mb-6">
            {/* Pulsing outer ring with festive colors */}
            <div
              className="absolute inset-0 rounded-full border-2 border-festive-gold/30"
              style={{ animation: 'pulse-ring 2s ease-in-out infinite' }}
            />

            <svg className="w-full h-full transform -rotate-90 relative z-10">
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
                stroke="url(#festiveGradient)"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 88}`}
                strokeDashoffset={`${2 * Math.PI * 88 * (1 - displayProgress / 100)}`}
                className="transition-all duration-300 ease-out"
                strokeLinecap="round"
              />
              {/* Glowing effect */}
              <circle
                cx="96"
                cy="96"
                r="88"
                stroke="url(#festiveGradient)"
                strokeWidth="12"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 88}`}
                strokeDashoffset={`${2 * Math.PI * 88 * (1 - displayProgress / 100)}`}
                className="transition-all duration-300 ease-out opacity-30 blur-sm"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="festiveGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffd700" />
                  <stop offset="50%" stopColor="#ff6b9d" />
                  <stop offset="100%" stopColor="#9d4edd" />
                </linearGradient>
              </defs>
            </svg>

            <div className="absolute inset-0 flex items-center justify-center z-20">
              <div className="text-center">
                <div className="text-4xl font-bold festive-gradient-text">
                  {Math.round(displayProgress)}%
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Step {currentStep} of 6
                </div>
              </div>
            </div>
          </div>

          {/* Transaction Counter */}
          {transactionsFetched !== null && transactionsFetched > 0 && progress < 50 && (
            <div className="bg-dark-800/50 border border-dark-600/50 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-center gap-3">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-festive-gold animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="text-2xl font-bold text-white">
                    {formatNumber(transactionsFetched)}
                  </span>
                </div>
                {transactionsTotal && transactionsTotal > transactionsFetched && (
                  <>
                    <span className="text-gray-500">/</span>
                    <span className="text-lg text-gray-400">~{formatNumber(transactionsTotal)}</span>
                  </>
                )}
              </div>
              <div className="text-sm text-gray-400 mt-1 text-center">
                {progress < 40 ? 'Transactions fetched' : 'Transactions processed'}
              </div>
              {transactionsTotal && transactionsTotal > transactionsFetched && (
                <div className="mt-2 pt-2 border-t border-dark-600 text-center">
                  <span className="text-sm text-festive-pink">
                    ~{formatNumber(transactionsTotal - transactionsFetched)} remaining
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Status message with activity indicator */}
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2">
              {/* Activity pulse - shows during calculating or saving stages */}
              {(currentStage === 'calculating' || currentStage === 'saving') && (
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-festive-gold rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-festive-pink rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-festive-purple rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
              <p className="text-lg text-gray-300">
                {statusMessage}
              </p>
            </div>
            {statusMessage.includes('Generating your year into PNL cards') && (
              <p className="text-sm text-gray-500 italic mt-1">
                It only takes a few seconds...
              </p>
            )}
            {/* Activity timestamp - shows last update time during long operations */}
            {(currentStage === 'calculating' || currentStage === 'saving') && secondsSinceUpdate > 0 && (
              <p className="text-xs text-gray-600 mt-2">
                Last update: {secondsSinceUpdate < 60 ? `${secondsSinceUpdate}s ago` : `${Math.floor(secondsSinceUpdate / 60)}m ${secondsSinceUpdate % 60}s ago`}
                {secondsSinceUpdate > 10 && (
                  <span className="text-festive-gold ml-2 animate-pulse">
                    {progressMessages[progressMessageIndex]}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Stage Progress Indicators */}
          <div className="mb-6">
            <div className="flex justify-between items-center">
              {stageConfig.map((stage, index) => {
                const isActive = index === currentStageIndex;
                const isComplete = index < currentStageIndex;

                return (
                  <div key={stage.key} className="flex flex-col items-center flex-1">
                    {/* Stage circle */}
                    <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                      isComplete
                        ? 'bg-gradient-to-r from-festive-gold to-festive-pink text-dark-900'
                        : isActive
                          ? 'bg-festive-gold/20 text-festive-gold ring-2 ring-festive-gold animate-pulse'
                          : 'bg-dark-700 text-gray-500'
                    }`}>
                      {isComplete ? (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        index + 1
                      )}
                    </div>

                    {/* Stage label */}
                    <div className={`mt-2 text-xs text-center transition-colors duration-300 ${
                      isActive ? 'text-festive-gold' : isComplete ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      {stage.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Progress bar with festive gradient */}
          <div className="h-2 bg-dark-700 rounded-full mb-6 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-festive-gold via-festive-pink to-festive-purple rounded-full transition-all duration-300 ease-out"
              style={{ width: `${displayProgress}%` }}
            />
          </div>

          {/* Stats boxes */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-dark-800/50 border border-dark-600/50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-festive-gold">{formatTime(elapsedTime)}</div>
              <div className="text-xs text-gray-400 mt-1">Elapsed</div>
            </div>
            <div className="bg-dark-800/50 border border-dark-600/50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-white">
                {transactionsFetched !== null ? formatNumber(transactionsFetched) : '-'}
              </div>
              <div className="text-xs text-gray-400 mt-1">Transactions</div>
            </div>
            <div className="bg-dark-800/50 border border-dark-600/50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-festive-purple">6</div>
              <div className="text-xs text-gray-400 mt-1">Highlights</div>
            </div>
          </div>

          {/* Cancel button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCancel();
            }}
            className="relative z-20 w-full py-3 px-4 rounded-xl bg-dark-800/50 hover:bg-dark-700/50 border border-dark-600/50 hover:border-dark-500 text-gray-400 hover:text-white font-medium transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancel Analysis
          </button>
        </div>

        {/* Current stage description card */}
        <div className="mt-6 bg-dark-900/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-festive-gold/20 to-festive-pink/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-festive-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-white">
                {stageConfig[currentStageIndex]?.label || 'Processing'}
              </h3>
              <p className="text-sm text-gray-400">
                {stageConfig[currentStageIndex]?.description || 'Working on your analysis...'}
              </p>
            </div>
          </div>

          {/* Tip */}
          <div className="text-xs text-gray-500 text-center mt-4 pt-4 border-t border-dark-700/50">
            Your <span className="text-festive-gold">2025</span> highlights will be ready once analysis completes
          </div>
        </div>
      </div>
    </main>
  );
}

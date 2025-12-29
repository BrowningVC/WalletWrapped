'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
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

// SVG Icons for stages
const StageIcon = ({ stage, className = "w-4 h-4" }: { stage: string; className?: string }) => {
  switch (stage) {
    case 'connect':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      );
    case 'scan':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
      );
    case 'parse':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'calculate':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    case 'save':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
        </svg>
      );
    case 'generate':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      );
    default:
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
};

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

// Analysis stage definitions with icon keys
const stageConfig = [
  { key: 'initializing', label: 'Connect', description: 'Connecting to Solana blockchain', iconKey: 'connect' },
  { key: 'fetching', label: 'Scan', description: 'Scanning your wallet history', iconKey: 'scan' },
  { key: 'parsing', label: 'Parse', description: 'Processing transaction data', iconKey: 'parse' },
  { key: 'calculating', label: 'Calculate', description: 'Computing your P&L metrics', iconKey: 'calculate' },
  { key: 'saving', label: 'Save', description: 'Securing your results', iconKey: 'save' },
  { key: 'highlights', label: 'Generate', description: 'Creating your highlight cards', iconKey: 'generate' },
];

// Progress encouragement messages that rotate every 4 seconds
const progressMessages = [
  "Analyzing your trading patterns...",
  "Calculating realized gains...",
  "Finding your best trades...",
  "Computing win rates...",
  "Identifying top performers...",
  "Measuring portfolio growth...",
  "Detecting trading streaks...",
  "Wrapping up the numbers...",
];

// Fun facts to show during long waits
const funFacts = [
  "The average Solana wallet has 847 transactions",
  "Top traders check their P&L 12x per day",
  "SOL has processed over 200 billion transactions",
  "The best day to trade is statistically Tuesday",
  "Most profitable trades happen in the first hour",
];

export default function AnalyzePage() {
  const params = useParams();
  const router = useRouter();
  const address = params.address as string;

  const [progress, setProgress] = useState(0);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Connecting to server...');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [error, setError] = useState('');

  // Simulated progress for initial connection phase (0-3%)
  // This provides immediate visual feedback while waiting for server
  const [simulatedProgress, setSimulatedProgress] = useState(0);

  const [currentStage, setCurrentStage] = useState('initializing');
  const [currentStep, setCurrentStep] = useState(1);
  const [transactionsFetched, setTransactionsFetched] = useState<number | null>(null);
  const [transactionsTotal, setTransactionsTotal] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const [progressMessageIndex, setProgressMessageIndex] = useState(0);
  const [funFactIndex, setFunFactIndex] = useState(() => Math.floor(Math.random() * funFacts.length));
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [pageReady, setPageReady] = useState(false);
  const [analysisStarted, setAnalysisStarted] = useState(false); // Track when POST completes
  const pendingRedirectRef = useRef<string | null>(null);
  const pageLoadTimeRef = useRef<number>(Date.now());

  // Minimum time to show progress UI before redirecting (allows user to see animation)
  const MIN_DISPLAY_TIME = 2500; // 2.5 seconds minimum to see the UI

  // Mark page as ready after first paint - ensures UI is visible before any redirect
  // This is critical: we must show the analyze page UI before any redirect
  useEffect(() => {
    // Use multiple frames to ensure the page is fully painted and visible to user
    let frameCount = 0;
    const waitForPaint = () => {
      frameCount++;
      if (frameCount < 3) {
        // Wait for 3 animation frames to ensure paint is complete
        requestAnimationFrame(waitForPaint);
      } else {
        // Then add a minimum visible time
        setTimeout(() => {
          setPageReady(true);
          console.log('Page ready for interaction after', frameCount, 'frames');
        }, 500); // 500ms minimum visibility before redirect can start
      }
    };
    requestAnimationFrame(waitForPaint);
  }, []);

  // Simulated progress animation during initial connection phase
  // Provides immediate visual feedback while waiting for server response
  // Progress ramps up quickly to feel responsive before real server data arrives
  useEffect(() => {
    // Only run simulation when real progress is 0
    if (progress > 0 || error) return;

    const messages = [
      { progress: 1, message: 'Connecting to server...', delay: 0 },
      { progress: 3, message: 'Establishing connection...', delay: 150 },
      { progress: 5, message: 'Preparing analysis...', delay: 300 },
      { progress: 7, message: 'Connecting to Solana...', delay: 500 },
      { progress: 9, message: 'Initializing scanner...', delay: 700 },
      { progress: 11, message: 'Scanning wallet...', delay: 1000 },
      { progress: 13, message: 'Starting fetch...', delay: 1500 },
      { progress: 15, message: 'Fetching history...', delay: 2500 },
      { progress: 16, message: 'Processing...', delay: 4000 },
      { progress: 17, message: 'Still loading...', delay: 6000 },
      { progress: 18, message: 'Almost there...', delay: 9000 },
    ];

    const timers: NodeJS.Timeout[] = [];

    messages.forEach(({ progress: p, message, delay }) => {
      const timer = setTimeout(() => {
        setSimulatedProgress(p);
        setStatusMessage(message);
      }, delay);
      timers.push(timer);
    });

    return () => timers.forEach(t => clearTimeout(t));
  }, [progress, error]);

  // Handle delayed redirect - ensures user sees progress animation
  useEffect(() => {
    // Don't redirect until page is fully rendered and visible
    if (!analysisComplete || !pendingRedirectRef.current || !pageReady) return;

    const timeElapsed = Date.now() - pageLoadTimeRef.current;
    const remainingTime = Math.max(0, MIN_DISPLAY_TIME - timeElapsed);

    console.log(`Analysis complete, redirecting in ${remainingTime}ms (elapsed: ${timeElapsed}ms)`);

    const timer = setTimeout(() => {
      if (pendingRedirectRef.current) {
        router.push(pendingRedirectRef.current);
      }
    }, remainingTime);

    return () => clearTimeout(timer);
  }, [analysisComplete, pageReady, router]);

  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      setSecondsSinceUpdate(Math.floor((Date.now() - lastUpdateTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, lastUpdateTime]);

  // Rotate progress messages every 4 seconds when analysis is taking a while
  useEffect(() => {
    if (secondsSinceUpdate < 5) return; // Only show messages if update is taking a while

    const interval = setInterval(() => {
      setProgressMessageIndex((prev) => (prev + 1) % progressMessages.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [secondsSinceUpdate]);

  // Rotate fun facts every 8 seconds
  useEffect(() => {
    if (elapsedTime < 10) return; // Only show after 10 seconds

    const interval = setInterval(() => {
      setFunFactIndex((prev) => (prev + 1) % funFacts.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [elapsedTime]);

  // Calculate effective progress (use simulated when real is 0)
  const effectiveProgress = progress > 0 ? progress : simulatedProgress;

  useEffect(() => {
    if (displayProgress >= effectiveProgress) return;

    const step = Math.max(0.3, (effectiveProgress - displayProgress) / 20);
    const interval = setInterval(() => {
      setDisplayProgress(prev => {
        const next = prev + step;
        if (next >= effectiveProgress) {
          clearInterval(interval);
          return effectiveProgress;
        }
        return next;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [effectiveProgress, displayProgress]);

  // Fallback polling for status when WebSocket events don't arrive
  // Use a ref to track current progress to avoid stale closure issues
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    // Don't start polling until POST has completed (analysis record exists)
    if (!address || error || !analysisStarted) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
    let pollCount = 0;
    let isCancelled = false;

    const pollStatus = async () => {
      if (isCancelled || progressRef.current === 100) return;

      try {
        console.log('📊 Polling status... current progress:', progressRef.current);
        const response = await fetch(`${apiUrl}/api/analyze/${address}/status`);
        if (!response.ok || isCancelled) return;

        const data = await response.json();
        console.log('📊 Poll response:', data.status, data.progress + '%');

        if (data.status === 'completed') {
          console.log('📊 Poll: Analysis completed!');
          setProgress(100);
          setCurrentStage('completing');
          setCurrentStep(6);
          setStatusMessage('Analysis complete! Preparing your highlights...');
          pendingRedirectRef.current = `/highlights/${address}`;
          setAnalysisComplete(true);
          return;
        }

        if (data.status === 'failed') {
          setError(data.error || 'Analysis failed');
          return;
        }

        // Update progress from polling if WebSocket isn't delivering
        // Use ref to get current value, avoiding stale closure
        if (data.progress > progressRef.current) {
          console.log('📊 Poll: Updating progress from', progressRef.current, 'to', data.progress);
          setProgress(data.progress);
          setStatusMessage(data.message || 'Processing...');
          setLastUpdateTime(Date.now());
        }
      } catch (err) {
        console.log('📊 Poll error:', err);
        // Silently ignore polling errors - WebSocket is primary
      }
    };

    // Adaptive polling: faster at start, slower after initial period
    // Uses setTimeout chain instead of nested intervals to avoid leaks
    const schedulePoll = () => {
      if (isCancelled || progressRef.current === 100) return;

      pollCount++;
      // Stop after 3 minutes (90 polls at 2s average)
      if (pollCount > 90) return;

      pollStatus().finally(() => {
        if (isCancelled || progressRef.current === 100) return;
        // Fast polling for first 10, then slow down
        const delay = pollCount <= 10 ? 1000 : 2000;
        setTimeout(schedulePoll, delay);
      });
    };

    // Start polling immediately since analysisStarted means POST completed
    console.log('📊 Starting polling (analysis confirmed started)');
    schedulePoll();

    return () => {
      isCancelled = true;
    };
  }, [address, error, analysisStarted]);

  useEffect(() => {
    if (!address) return;

    setStartTime(Date.now());
    let postRequestSent = false; // Track if we've already triggered startAnalysis

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3002';
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      console.log('✅ Socket connected, id:', newSocket.id);
      console.log('📤 Subscribing to wallet:', address);
      newSocket.emit('subscribe', { walletAddress: address });

      // Wait a brief moment for subscription to be processed, then start analysis
      // This ensures we're listening before the server starts emitting events
      setTimeout(() => {
        if (!postRequestSent) {
          postRequestSent = true;
          console.log('🚀 Socket ready - starting analysis');
          startAnalysis();
        }
      }, 150); // Slightly longer to ensure subscription is processed
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    // Handle status events from server (emitted on subscribe if analysis exists)
    newSocket.on('status', (data) => {
      console.log('📡 Socket status event received:', JSON.stringify(data));
      // If analysis is already completed, show completion and schedule redirect
      if (data.status === 'completed') {
        console.log('📡 Status indicates completed - scheduling redirect');
        setProgress(100);
        setCurrentStage('completing');
        setCurrentStep(6);
        setStatusMessage('Analysis complete! Preparing your highlights...');
        pendingRedirectRef.current = `/highlights/${address}`;
        setAnalysisComplete(true);
      } else if (data.status === 'processing') {
        console.log('📡 Status indicates processing - analysis in progress');
        // Mark as started so polling can begin
        setAnalysisStarted(true);
        // If there's progress info, update it
        if (data.progress !== undefined) {
          setProgress(data.progress);
        }
      } else if (data.status === 'not_found') {
        console.log('📡 Status indicates not_found - need to start analysis');
      }
    });

    // Fallback: if socket doesn't connect within 2 seconds, start analysis anyway
    // This ensures analysis runs even if WebSockets are blocked
    const connectionTimeout = setTimeout(() => {
      if (!postRequestSent) {
        postRequestSent = true;
        console.log('Socket connection timeout - starting analysis with polling fallback');
        startAnalysis();
      }
    }, 2000);

    newSocket.on('progress', (data: ProgressData) => {
      console.log('🔄 PROGRESS UPDATE RECEIVED:', data.percent, '%', data.message);
      console.log('   Full data:', JSON.stringify(data));

      // Force state updates
      setProgress(prevProgress => {
        console.log('   Setting progress from', prevProgress, 'to', data.percent);
        return data.percent;
      });
      setStatusMessage(data.message);
      setLastUpdateTime(Date.now()); // Reset activity timer on each progress update

      if (data.stage) {
        console.log('   Setting stage:', data.stage);
        setCurrentStage(data.stage);
      }
      if (data.currentStep !== undefined && data.currentStep !== null) {
        console.log('   Setting step:', data.currentStep);
        setCurrentStep(data.currentStep);
      }
      if (data.transactionsFetched !== undefined) setTransactionsFetched(data.transactionsFetched);
      if (data.transactionsTotal !== undefined) setTransactionsTotal(data.transactionsTotal);
      if (data.startTime && !startTime) setStartTime(data.startTime);
    });

    newSocket.on('complete', (data) => {
      console.log('Analysis complete:', data);
      setProgress(100);
      setCurrentStage('completing');
      setCurrentStep(6);
      setStatusMessage('Analysis complete! Preparing your highlights...');

      // Prefetch the highlights page for instant navigation
      router.prefetch(`/highlights/${address}`);

      // Start preloading the first card image immediately
      // This warms up the edge cache so the image is ready when the user arrives
      const img = new Image();
      img.src = `/api/card/${address}/0`;

      // Schedule redirect with minimum display time
      pendingRedirectRef.current = `/highlights/${address}`;
      setAnalysisComplete(true);
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
      clearTimeout(connectionTimeout);
      if (newSocket) {
        newSocket.emit('unsubscribe', { walletAddress: address });
        newSocket.disconnect();
      }
    };
  }, [address, router]);

  const startAnalysis = async () => {
    console.log('🏁 === startAnalysis() called ===');
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
      console.log('🌐 API URL:', apiUrl);

      // First, fetch CSRF token
      console.log('Fetching CSRF token...');
      const csrfResponse = await fetch(`${apiUrl}/api/csrf-token`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!csrfResponse.ok) {
        console.error('CSRF fetch failed:', csrfResponse.status, csrfResponse.statusText);
        throw new Error('Failed to get CSRF token');
      }

      const csrfData = await csrfResponse.json();
      const csrfToken = csrfData.csrfToken;
      console.log('Got CSRF token, starting POST...');

      // Now make the analyze request with CSRF token
      console.log('📮 Making POST request to /api/analyze...');
      let response;
      try {
        response = await fetch(`${apiUrl}/api/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify({ walletAddress: address }),
        });
        console.log('📮 POST response status:', response.status);
      } catch (fetchError: any) {
        console.error('📮 POST fetch error:', fetchError.message);
        throw fetchError;
      }

      let data;
      try {
        data = await response.json();
        console.log('📮 POST response data:', JSON.stringify(data));
      } catch (jsonError: any) {
        console.error('📮 Failed to parse response JSON:', jsonError.message);
        throw new Error('Invalid server response');
      }

      if (!response.ok) {
        console.error('📮 POST failed:', data);
        throw new Error(data.message || 'Failed to start analysis');
      }

      console.log('✅ Analysis started successfully:', data);

      // Mark analysis as started - this enables polling
      setAnalysisStarted(true);

      if (data.status === 'completed') {
        setProgress(100);
        setCurrentStage('completing');
        setCurrentStep(6);
        setStatusMessage('Analysis complete! Preparing your highlights...');
        pendingRedirectRef.current = `/highlights/${address}`;
        setAnalysisComplete(true);
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

          {/* Dynamic status banner */}
          <div className={`rounded-xl p-4 mb-6 text-center transition-all duration-500 ${
            displayProgress >= 90
              ? 'bg-profit-500/10 border border-profit-500/20'
              : displayProgress >= 50
                ? 'bg-festive-pink/10 border border-festive-pink/20'
                : 'bg-festive-gold/10 border border-festive-gold/20'
          }`}>
            <div className={`flex items-center justify-center gap-2 ${
              displayProgress >= 90 ? 'text-profit-500' : displayProgress >= 50 ? 'text-festive-pink' : 'text-festive-gold'
            }`}>
              {displayProgress >= 90 ? (
                <>
                  <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium">Almost done! Finishing up...</span>
                </>
              ) : displayProgress >= 50 ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="font-medium">Crunching the numbers...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">
                    {transactionsTotal && transactionsTotal > 5000
                      ? 'Large wallet detected - this may take a minute'
                      : 'Analysis typically takes 15-45 seconds'}
                  </span>
                </>
              )}
            </div>
            {elapsedTime >= 10 && displayProgress < 90 && (
              <p className="text-xs text-gray-400 mt-2 animate-fade-in flex items-center justify-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-festive-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {funFacts[funFactIndex]}
              </p>
            )}
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
            <div className="flex items-center justify-center gap-3">
              {/* Activity pulse - always show during active analysis */}
              {displayProgress > 0 && displayProgress < 100 && (
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-festive-gold rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-festive-pink rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-festive-purple rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
              <p className="text-lg text-gray-200 font-medium">
                {statusMessage}
              </p>
            </div>
            {/* Rotating encouragement messages during slow phases */}
            {secondsSinceUpdate >= 5 && displayProgress < 90 && (
              <p className="text-sm text-festive-gold/80 mt-2 animate-pulse transition-all duration-300">
                {progressMessages[progressMessageIndex]}
              </p>
            )}
          </div>

          {/* Stage Progress Indicators */}
          <div className="mb-6">
            <div className="flex justify-between items-center relative">
              {/* Connection line behind circles */}
              <div className="absolute top-4 left-[8%] right-[8%] h-0.5 bg-dark-700">
                <div
                  className="h-full bg-gradient-to-r from-festive-gold via-festive-pink to-festive-purple transition-all duration-500"
                  style={{ width: `${Math.min(100, (currentStageIndex / (stageConfig.length - 1)) * 100)}%` }}
                />
              </div>
              {stageConfig.map((stage, index) => {
                const isActive = index === currentStageIndex;
                const isComplete = index < currentStageIndex;

                return (
                  <div key={stage.key} className="flex flex-col items-center flex-1 relative z-10">
                    {/* Stage circle */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all duration-300 ${
                      isComplete
                        ? 'bg-gradient-to-r from-festive-gold to-festive-pink shadow-lg shadow-festive-gold/20'
                        : isActive
                          ? 'bg-dark-800 ring-2 ring-festive-gold ring-offset-2 ring-offset-dark-900 animate-pulse'
                          : 'bg-dark-800 border border-dark-600'
                    }`}>
                      {isComplete ? (
                        <svg className="w-4 h-4 text-dark-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <div className={`${isActive ? 'animate-bounce' : ''} ${isActive ? 'text-festive-gold' : 'text-gray-500'}`}>
                          <StageIcon stage={stage.iconKey} className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    {/* Stage label */}
                    <div className={`mt-2 text-xs text-center font-medium transition-colors duration-300 ${
                      isActive ? 'text-festive-gold' : isComplete ? 'text-gray-300' : 'text-gray-600'
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
            <div className="bg-dark-800/50 border border-dark-600/50 rounded-xl p-3 text-center group hover:border-festive-gold/30 transition-colors">
              <div className="text-xl font-bold text-festive-gold">{formatTime(elapsedTime)}</div>
              <div className="text-xs text-gray-400 mt-1">Elapsed</div>
            </div>
            <div className="bg-dark-800/50 border border-dark-600/50 rounded-xl p-3 text-center group hover:border-festive-pink/30 transition-colors">
              <div className="text-xl font-bold text-white">
                {transactionsTotal ? formatNumber(transactionsTotal) : transactionsFetched !== null ? formatNumber(transactionsFetched) : '-'}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {transactionsTotal ? 'Total Txns' : 'Transactions'}
              </div>
            </div>
            <div className="bg-dark-800/50 border border-dark-600/50 rounded-xl p-3 text-center group hover:border-festive-purple/30 transition-colors">
              <div className="flex justify-center">
                {displayProgress >= 85 ? (
                  <svg className="w-6 h-6 text-festive-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                ) : displayProgress >= 50 ? (
                  <svg className="w-6 h-6 text-festive-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-festive-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {displayProgress >= 85 ? 'Almost Ready!' : displayProgress >= 50 ? 'Calculating' : 'Scanning'}
              </div>
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
        <div className="mt-6 bg-dark-900/60 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-festive-gold/20 via-festive-pink/20 to-festive-purple/20 flex items-center justify-center text-festive-gold">
              <StageIcon stage={stageConfig[currentStageIndex]?.iconKey || 'connect'} className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white">
                  {stageConfig[currentStageIndex]?.label || 'Processing'}
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-festive-gold/10 text-festive-gold">
                  Step {currentStep}/6
                </span>
              </div>
              <p className="text-sm text-gray-400 mt-0.5">
                {stageConfig[currentStageIndex]?.description || 'Working on your analysis...'}
              </p>
            </div>
          </div>

          {/* What's coming next */}
          {currentStageIndex < stageConfig.length - 1 && (
            <div className="mt-4 pt-4 border-t border-dark-700/50 flex items-center justify-between">
              <span className="text-xs text-gray-500">Next up:</span>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <StageIcon stage={stageConfig[currentStageIndex + 1]?.iconKey || 'scan'} className="w-3.5 h-3.5" />
                <span>{stageConfig[currentStageIndex + 1]?.label}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

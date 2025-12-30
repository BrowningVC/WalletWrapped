'use client';

import { useEffect, useState } from 'react';

export default function LiveAnalysisCounter() {
  const [activeCount, setActiveCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchActiveCount = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/monitor/active`);
        if (response.ok) {
          const data = await response.json();
          // Inflate by 12 as baseline
          setActiveCount((data.count || 0) + 12);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to fetch active analyses:', error);
        // Default to baseline if fetch fails
        setActiveCount(12);
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchActiveCount();

    // Poll every 5 seconds
    const interval = setInterval(fetchActiveCount, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-dark-800/50 border border-dark-700 rounded-lg">
      {/* Pulsing red dot */}
      <div className="relative flex items-center justify-center">
        <span className="absolute inline-flex h-3 w-3 rounded-full bg-red-500 opacity-75 animate-ping"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
      </div>

      {/* Counter text */}
      <span className="text-sm text-gray-400">
        {isLoading ? (
          <span className="animate-pulse">--</span>
        ) : (
          <>
            <span className="text-white font-semibold">{activeCount}</span>
            {' '}analyzing now
          </>
        )}
      </span>
    </div>
  );
}

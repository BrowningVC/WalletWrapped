'use client';

import { useState, useEffect, useCallback } from 'react';

interface Stats {
  analyses: {
    total_analyses: string;
    completed: string;
    processing: string;
    failed: string;
    pending: string;
    last_24h: string;
    last_hour: string;
    total_transactions_analyzed: string;
    avg_duration_seconds: string;
  };
  positions: {
    wallets_with_positions: string;
    total_positions: string;
    active_positions: string;
  };
  serverTime: string;
}

interface Analysis {
  wallet_address: string;
  analysis_status: string;
  progress_percent: number;
  total_transactions: number;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
  error_message: string | null;
  duration_seconds: number;
  elapsed_seconds?: number;
}

interface HourlyData {
  hour: string;
  total: string;
  completed: string;
  failed: string;
  avg_transactions: string;
}

export default function AdminDashboard() {
  const [adminKey, setAdminKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [liveAnalyses, setLiveAnalyses] = useState<Analysis[]>([]);
  const [recentAnalyses, setRecentAnalyses] = useState<Analysis[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

  const fetchData = useCallback(async () => {
    if (!adminKey) return;

    try {
      const headers = { 'X-Admin-Key': adminKey };

      const [statsRes, liveRes, recentRes, hourlyRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/stats`, { headers }),
        fetch(`${API_URL}/api/admin/analyses/live`, { headers }),
        fetch(`${API_URL}/api/admin/analyses/recent?hours=24`, { headers }),
        fetch(`${API_URL}/api/admin/hourly`, { headers }),
      ]);

      if (!statsRes.ok) {
        if (statsRes.status === 401) {
          setError('Invalid admin key');
          setIsAuthenticated(false);
          return;
        }
        throw new Error('Failed to fetch data');
      }

      const [statsData, liveData, recentData, hourlyDataRes] = await Promise.all([
        statsRes.json(),
        liveRes.json(),
        recentRes.json(),
        hourlyRes.json(),
      ]);

      setStats(statsData);
      setLiveAnalyses(liveData.live || []);
      setRecentAnalyses(recentData.analyses || []);
      setHourlyData(hourlyDataRes.hourly || []);
      setIsAuthenticated(true);
      setError('');
    } catch (err) {
      setError('Failed to fetch data');
      console.error(err);
    }
  }, [adminKey, API_URL]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/admin/stats`, {
        headers: { 'X-Admin-Key': adminKey },
      });

      if (res.ok) {
        setIsAuthenticated(true);
        localStorage.setItem('adminKey', adminKey);
        await fetchData();
      } else {
        setError('Invalid admin key');
      }
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  // Check for saved admin key on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('adminKey');
    if (savedKey) {
      setAdminKey(savedKey);
    }
  }, []);

  // Fetch data when authenticated
  useEffect(() => {
    if (adminKey && !isAuthenticated) {
      fetchData();
    }
  }, [adminKey, isAuthenticated, fetchData]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!isAuthenticated || !autoRefresh) return;

    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [isAuthenticated, autoRefresh, fetchData]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'processing': return 'text-yellow-400';
      case 'failed': return 'text-red-400';
      case 'pending': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAdminKey('');
    localStorage.removeItem('adminKey');
  };

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-dark-800 border border-dark-700 rounded-lg p-8">
            <h1 className="text-2xl font-bold text-white mb-6 text-center">Admin Dashboard</h1>

            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label className="block text-gray-400 text-sm mb-2">Admin Key</label>
                <input
                  type="password"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-900 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  placeholder="Enter admin secret key"
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm mb-4">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !adminKey}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
              >
                {loading ? 'Authenticating...' : 'Login'}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-dark-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">WalletWrapped Admin</h1>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-gray-400">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4"
              />
              Auto-refresh
            </label>
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-white text-sm"
            >
              Refresh Now
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
            <StatCard label="Total Analyses" value={stats.analyses.total_analyses} />
            <StatCard label="Last 24h" value={stats.analyses.last_24h} color="text-purple-400" />
            <StatCard label="Last Hour" value={stats.analyses.last_hour} color="text-blue-400" />
            <StatCard label="Completed" value={stats.analyses.completed} color="text-green-400" />
            <StatCard label="Processing" value={stats.analyses.processing} color="text-yellow-400" />
            <StatCard label="Failed" value={stats.analyses.failed} color="text-red-400" />
            <StatCard
              label="Avg Duration"
              value={formatDuration(parseFloat(stats.analyses.avg_duration_seconds))}
            />
            <StatCard
              label="Total TXs Analyzed"
              value={parseInt(stats.analyses.total_transactions_analyzed || '0').toLocaleString()}
            />
            <StatCard label="Wallets w/ Positions" value={stats.positions.wallets_with_positions} />
            <StatCard label="Total Positions" value={parseInt(stats.positions.total_positions || '0').toLocaleString()} />
            <StatCard label="Active Positions" value={parseInt(stats.positions.active_positions || '0').toLocaleString()} />
            <StatCard label="Server Time" value={formatTime(stats.serverTime)} color="text-gray-500" />
          </div>
        )}

        {/* Live Analyses */}
        <div className="bg-dark-800 border border-dark-700 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Live Analyses ({liveAnalyses.length})
          </h2>

          {liveAnalyses.length === 0 ? (
            <p className="text-gray-500">No analyses currently running</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-dark-600">
                    <th className="text-left py-2 px-2">Wallet</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-left py-2 px-2">Progress</th>
                    <th className="text-left py-2 px-2">Elapsed</th>
                    <th className="text-left py-2 px-2">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {liveAnalyses.map((a) => (
                    <tr key={a.wallet_address} className="border-b border-dark-700 hover:bg-dark-700/50">
                      <td className="py-2 px-2 font-mono text-xs text-gray-300">
                        {a.wallet_address.slice(0, 8)}...{a.wallet_address.slice(-6)}
                      </td>
                      <td className={`py-2 px-2 ${getStatusColor(a.analysis_status)}`}>
                        {a.analysis_status}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-dark-600 rounded-full h-2">
                            <div
                              className="bg-purple-500 h-2 rounded-full transition-all"
                              style={{ width: `${a.progress_percent || 0}%` }}
                            />
                          </div>
                          <span className="text-gray-400 text-xs">{a.progress_percent || 0}%</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-gray-400">
                        {formatDuration(a.elapsed_seconds || 0)}
                      </td>
                      <td className="py-2 px-2 text-gray-500 text-xs">
                        {formatTime(a.started_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Hourly Stats */}
        {hourlyData.length > 0 && (
          <div className="bg-dark-800 border border-dark-700 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">Hourly Activity (Last 24h)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-dark-600">
                    <th className="text-left py-2 px-2">Hour</th>
                    <th className="text-left py-2 px-2">Total</th>
                    <th className="text-left py-2 px-2">Completed</th>
                    <th className="text-left py-2 px-2">Failed</th>
                    <th className="text-left py-2 px-2">Avg TXs</th>
                  </tr>
                </thead>
                <tbody>
                  {hourlyData.slice(0, 12).map((h) => (
                    <tr key={h.hour} className="border-b border-dark-700">
                      <td className="py-2 px-2 text-gray-300">{formatTime(h.hour)}</td>
                      <td className="py-2 px-2 text-white">{h.total}</td>
                      <td className="py-2 px-2 text-green-400">{h.completed}</td>
                      <td className="py-2 px-2 text-red-400">{h.failed}</td>
                      <td className="py-2 px-2 text-gray-400">
                        {Math.round(parseFloat(h.avg_transactions || '0'))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent Analyses */}
        <div className="bg-dark-800 border border-dark-700 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Recent Analyses (24h)</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-dark-600">
                  <th className="text-left py-2 px-2">Wallet</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-left py-2 px-2">Transactions</th>
                  <th className="text-left py-2 px-2">Duration</th>
                  <th className="text-left py-2 px-2">Started</th>
                  <th className="text-left py-2 px-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {recentAnalyses.slice(0, 50).map((a) => (
                  <tr key={a.wallet_address + a.started_at} className="border-b border-dark-700 hover:bg-dark-700/50">
                    <td className="py-2 px-2 font-mono text-xs text-gray-300">
                      <a
                        href={`https://solscan.io/account/${a.wallet_address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-purple-400"
                      >
                        {a.wallet_address.slice(0, 8)}...{a.wallet_address.slice(-6)}
                      </a>
                    </td>
                    <td className={`py-2 px-2 ${getStatusColor(a.analysis_status)}`}>
                      {a.analysis_status}
                    </td>
                    <td className="py-2 px-2 text-white">
                      {a.total_transactions?.toLocaleString() || '-'}
                    </td>
                    <td className="py-2 px-2 text-gray-400">
                      {formatDuration(a.duration_seconds)}
                    </td>
                    <td className="py-2 px-2 text-gray-500 text-xs">
                      {formatDate(a.started_at)}
                    </td>
                    <td className="py-2 px-2 text-red-400 text-xs max-w-[200px] truncate">
                      {a.error_message || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  color = 'text-white'
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg p-4">
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

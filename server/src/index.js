require('dotenv').config();
const cluster = require('cluster');
const os = require('os');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Database initialization
const { query } = require('./config/database');
const redis = require('./config/redis');
const DatabaseQueries = require('./database/queries');

// Routes
const analyzeRoutes = require('./routes/analyze');
const walletRoutes = require('./routes/wallet');

// Socket.io handlers
const { initializeSocketHandlers } = require('./socket/handlers');

// Analysis Orchestrator (replaces old queue-based worker)
const AnalysisOrchestrator = require('./services/analysisOrchestrator');

// Number of CPU cores to use (leave 1 for system)
const NUM_WORKERS = Math.max(1, os.cpus().length - 1);

// Constants
const PORT = process.env.PORT || 3002;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

/**
 * Express App Setup
 */
const app = express();
const server = http.createServer(app);

// Socket.io setup with CORS
const io = new Server(server, {
  cors: {
    origin: NODE_ENV === 'production'
      ? [CLIENT_URL, 'https://walletwrapped.com', 'https://www.walletwrapped.com']
      : '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

/**
 * Middleware
 */

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Allow embedding images
  crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
  origin: NODE_ENV === 'production'
    ? [CLIENT_URL, 'https://walletwrapped.com', 'https://www.walletwrapped.com']
    : '*',
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Compression
app.use(compression());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Global rate limiting (100 requests per minute per IP)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: {
    error: 'Too many requests',
    message: 'Please slow down and try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(globalLimiter);

/**
 * Routes
 */

// Health check
app.get('/health', async (req, res) => {
  try {
    // Check database
    await query('SELECT 1');

    // Check Redis
    await redis.ping();

    // Get active analyses count
    const activeAnalyses = AnalysisOrchestrator.getActiveCount();
    const activeWallets = AnalysisOrchestrator.getActiveWallets();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
        analyses: {
          active: activeAnalyses,
          wallets: activeWallets
        }
      },
      cluster: {
        workers: NUM_WORKERS,
        pid: process.pid
      },
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// API info
app.get('/api', (req, res) => {
  res.json({
    name: 'WalletWrapped API',
    version: '1.0.0',
    description: 'Solana wallet analytics and trading highlights',
    endpoints: {
      analyze: {
        'POST /api/analyze': 'Start wallet analysis',
        'GET /api/analyze/:address/status': 'Get analysis status',
        'DELETE /api/analyze/:address': 'Cancel analysis'
      },
      wallet: {
        'GET /api/wallet/:address/summary': 'Get wallet summary',
        'GET /api/wallet/:address/positions': 'Get token positions',
        'GET /api/wallet/:address/highlights': 'Get highlight cards',
        'GET /api/wallet/:address/calendar': 'Get daily P&L calendar',
        'POST /api/wallet/:address/refresh': 'Refresh analysis'
      },
      stats: {
        'GET /api/stats': 'Get platform statistics (wallet count, etc.)'
      }
    },
    socketEvents: {
      client: ['subscribe', 'unsubscribe', 'ping'],
      server: ['progress', 'complete', 'error', 'status', 'pong']
    }
  });
});

// Platform stats endpoint - returns wallet count for live counter
app.get('/api/stats', async (req, res) => {
  // Prevent caching so counter updates in real-time
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  try {
    // Get count of all wallet analyses (completed, failed, or processing)
    // This counts unique wallets that have ever been analyzed
    const result = await query(`
      SELECT
        COUNT(DISTINCT wallet_address) as wallets_analyzed,
        COUNT(*) as total_analyses
      FROM wallet_analyses
    `);

    const stats = result.rows[0];

    // Get active analyses count
    const activeAnalyses = AnalysisOrchestrator.getActiveCount();

    res.json({
      walletsAnalyzed: parseInt(stats.wallets_analyzed) || 0,
      totalAnalyses: parseInt(stats.total_analyses) || 0,
      activeAnalyses: activeAnalyses,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Stats endpoint error:', error);
    res.status(500).json({
      error: 'Failed to fetch stats',
      walletsAnalyzed: 0,
      totalAnalyses: 0,
      activeAnalyses: 0
    });
  }
});

// Mount API routes
app.use('/api', analyzeRoutes);
app.use('/api', walletRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Express error:', err);

  const status = err.status || 500;
  const message = NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(status).json({
    error: err.name || 'Error',
    message,
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

/**
 * Initialize Services
 */

async function initializeServices() {
  console.log('\n========================================');
  console.log('WalletWrapped Server Starting...');
  console.log(`Worker PID: ${process.pid}`);
  console.log('========================================\n');

  try {
    // Test database connection
    console.log('Testing database connection...');
    await query('SELECT NOW()');
    console.log('Database connected\n');

    // Test Redis connection
    console.log('Testing Redis connection...');
    await redis.ping();
    console.log('Redis connected\n');

    // Initialize Socket.io
    console.log('Initializing Socket.io...');
    initializeSocketHandlers(io);
    AnalysisOrchestrator.setSocketIO(io); // Connect orchestrator to Socket.io
    console.log('Socket.io initialized\n');

    console.log('========================================');
    console.log('All services initialized successfully');
    console.log('Ready for concurrent wallet analyses!');
    console.log('========================================\n');

  } catch (error) {
    console.error('\nService initialization failed:', error);
    process.exit(1);
  }
}

/**
 * Start Server
 */

async function startServer() {
  await initializeServices();

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Environment: ${NODE_ENV}`);
    console.log(`🌐 Client URL: ${CLIENT_URL}`);
    console.log(`\n📡 Endpoints:`);
    console.log(`   - Health: http://localhost:${PORT}/health`);
    console.log(`   - API Info: http://localhost:${PORT}/api`);
    console.log(`   - Socket.io: ws://localhost:${PORT}`);
    console.log(`\n✨ Ready to analyze wallets!\n`);

    // Run cleanup of stale processing analyses every 2 minutes
    setInterval(async () => {
      try {
        await DatabaseQueries.cleanupStaleProcessing();
      } catch (error) {
        console.error('Cleanup stale processing error:', error.message);
      }
    }, 2 * 60 * 1000);

    // Run initial cleanup on startup
    DatabaseQueries.cleanupStaleProcessing().catch(err =>
      console.error('Initial stale cleanup error:', err.message)
    );
  });
}

/**
 * Graceful Shutdown
 */

async function gracefulShutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);

  // Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed');

    try {
      // Close Socket.io
      io.close(() => {
        console.log('Socket.io closed');
      });

      // Close database pool
      const { pool } = require('./config/database');
      await pool.end();
      console.log('Database pool closed');

      // Close Redis
      await redis.disconnect();
      console.log('Redis connection closed');

      console.log('✓ Graceful shutdown complete');
      process.exit(0);

    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Start the server with cluster mode for multi-core utilization
if (require.main === module) {
  const USE_CLUSTER = process.env.USE_CLUSTER !== 'false' && NODE_ENV === 'production';

  if (USE_CLUSTER && cluster.isPrimary) {
    console.log(`\n========================================`);
    console.log(`Primary process ${process.pid} starting`);
    console.log(`Spawning ${NUM_WORKERS} worker processes...`);
    console.log(`========================================\n`);

    // Fork workers
    for (let i = 0; i < NUM_WORKERS; i++) {
      cluster.fork();
    }

    // Handle worker exit
    cluster.on('exit', (worker, code, signal) => {
      console.log(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
      cluster.fork();
    });

    // Log when workers come online
    cluster.on('online', (worker) => {
      console.log(`Worker ${worker.process.pid} is online`);
    });

  } else {
    // Single process mode (development) or worker process (production)
    startServer().catch((error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
  }
}

module.exports = { app, server, io };

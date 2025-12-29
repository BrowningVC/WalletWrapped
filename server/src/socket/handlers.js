const CacheManager = require('../utils/cacheManager');
const DatabaseQueries = require('../database/queries');

/**
 * Socket.io Event Handlers
 * Manages real-time progress updates for wallet analysis
 */

// Per-socket rate limiting for subscribe/unsubscribe events
// Prevents socket flooding attacks
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_SUBSCRIBE_EVENTS = 30; // Max 30 subscribe events per minute per socket
const MAX_UNSUBSCRIBE_EVENTS = 30;
const socketRateLimits = new Map(); // socketId -> { subscribes: [], unsubscribes: [] }

/**
 * Check and update rate limit for a socket event
 * @returns {boolean} true if allowed, false if rate limited
 */
function checkRateLimit(socketId, eventType) {
  const now = Date.now();
  const maxEvents = eventType === 'subscribe' ? MAX_SUBSCRIBE_EVENTS : MAX_UNSUBSCRIBE_EVENTS;

  if (!socketRateLimits.has(socketId)) {
    socketRateLimits.set(socketId, { subscribes: [], unsubscribes: [] });
  }

  const limits = socketRateLimits.get(socketId);
  const eventList = eventType === 'subscribe' ? limits.subscribes : limits.unsubscribes;

  // Remove events outside the window
  const windowStart = now - RATE_LIMIT_WINDOW;
  while (eventList.length > 0 && eventList[0] < windowStart) {
    eventList.shift();
  }

  // Check if over limit
  if (eventList.length >= maxEvents) {
    return false;
  }

  // Record this event
  eventList.push(now);
  return true;
}

/**
 * Clean up rate limit data for disconnected socket
 */
function cleanupSocketRateLimit(socketId) {
  socketRateLimits.delete(socketId);
}

/**
 * Initialize Socket.io handlers
 * @param {SocketIO.Server} io - Socket.io server instance
 */
function initializeSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    /**
     * Subscribe to analysis progress updates
     * Client emits: { walletAddress: string }
     */
    socket.on('subscribe', async ({ walletAddress }) => {
      // Rate limit check
      if (!checkRateLimit(socket.id, 'subscribe')) {
        socket.emit('error', { message: 'Rate limit exceeded. Please slow down.' });
        return;
      }

      if (!walletAddress) {
        socket.emit('error', { message: 'Missing wallet address' });
        return;
      }

      // Join room for this wallet address
      const room = `analysis:${walletAddress}`;
      socket.join(room);

      console.log(`Socket ${socket.id} subscribed to ${walletAddress}`);

      // Send current analysis status immediately
      try {
        const analysis = await DatabaseQueries.getAnalysis(walletAddress);

        if (!analysis) {
          socket.emit('status', {
            status: 'not_found',
            message: 'No analysis found for this wallet'
          });
          return;
        }

        // If processing, send current progress from cache
        if (analysis.analysis_status === 'processing') {
          const progress = await CacheManager.getAnalysisProgress(walletAddress);
          if (progress) {
            try {
              const progressData = JSON.parse(progress);
              socket.emit('progress', {
                percent: progressData.percent,
                message: progressData.message,
                timestamp: progressData.timestamp
              });
            } catch (parseError) {
              // Invalid JSON in cache, fallback to database progress
              console.warn(`Invalid progress JSON for ${walletAddress}:`, parseError.message);
              socket.emit('progress', {
                percent: analysis.progress_percent || 0,
                message: 'Analysis in progress...',
                timestamp: new Date().toISOString()
              });
            }
          } else {
            // Fallback to database progress
            socket.emit('progress', {
              percent: analysis.progress_percent || 0,
              message: 'Analysis in progress...',
              timestamp: new Date().toISOString()
            });
          }
        }

        // If completed, send completion event
        else if (analysis.analysis_status === 'completed') {
          socket.emit('complete', {
            status: 'completed',
            completedAt: analysis.completed_at,
            transactionCount: analysis.total_transactions
          });
        }

        // If failed, send error
        else if (analysis.analysis_status === 'failed') {
          socket.emit('error', {
            status: 'failed',
            message: analysis.error_message || 'Analysis failed'
          });
        }

      } catch (error) {
        console.error(`Error sending status to ${socket.id}:`, error);
        socket.emit('error', {
          message: 'Failed to get analysis status'
        });
      }
    });

    /**
     * Unsubscribe from analysis updates
     * Client emits: { walletAddress: string }
     */
    socket.on('unsubscribe', ({ walletAddress }) => {
      // Rate limit check
      if (!checkRateLimit(socket.id, 'unsubscribe')) {
        socket.emit('error', { message: 'Rate limit exceeded. Please slow down.' });
        return;
      }

      if (!walletAddress) return;

      const room = `analysis:${walletAddress}`;
      socket.leave(room);

      console.log(`Socket ${socket.id} unsubscribed from ${walletAddress}`);
    });

    /**
     * Ping/pong for connection health check
     */
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    /**
     * Handle disconnection
     */
    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
      // Clean up rate limit data
      cleanupSocketRateLimit(socket.id);
    });

    /**
     * Handle errors
     */
    socket.on('error', (error) => {
      console.error(`Socket error from ${socket.id}:`, error);
    });
  });

  // Log when server is ready
  console.log('Socket.io handlers initialized');
}

/**
 * Emit progress update to all clients subscribed to wallet
 * (Called from worker)
 *
 * @param {SocketIO.Server} io
 * @param {string} walletAddress
 * @param {Object} data - { percent, message, timestamp }
 */
function emitProgress(io, walletAddress, data) {
  io.to(`analysis:${walletAddress}`).emit('progress', data);
}

/**
 * Emit completion event
 *
 * @param {SocketIO.Server} io
 * @param {string} walletAddress
 * @param {Object} result
 */
function emitComplete(io, walletAddress, result) {
  io.to(`analysis:${walletAddress}`).emit('complete', {
    status: 'completed',
    ...result
  });
}

/**
 * Emit error event
 *
 * @param {SocketIO.Server} io
 * @param {string} walletAddress
 * @param {Error} error
 */
function emitError(io, walletAddress, error) {
  io.to(`analysis:${walletAddress}`).emit('error', {
    status: 'failed',
    message: error.message,
    timestamp: new Date().toISOString()
  });
}

/**
 * Get count of connected clients for a wallet
 *
 * @param {SocketIO.Server} io
 * @param {string} walletAddress
 * @returns {Promise<number>}
 */
async function getSubscriberCount(io, walletAddress) {
  const room = `analysis:${walletAddress}`;
  const sockets = await io.in(room).fetchSockets();
  return sockets.length;
}

module.exports = {
  initializeSocketHandlers,
  emitProgress,
  emitComplete,
  emitError,
  getSubscriberCount
};

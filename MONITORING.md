# WalletWrapped Monitoring & Queue System

## Overview

Your WalletWrapped application now includes:
- **Queue System**: Automatically queues requests when capacity is exceeded
- **Real-time Monitoring**: Track concurrent usage, performance metrics, and system health
- **Capacity Management**: Handles up to 20 concurrent analyses (configurable)

## Configuration

### Environment Variables (.env)

```env
HELIUS_RPS_LIMIT=50                # Helius Developer plan: 50 RPS
MAX_CONCURRENT_ANALYSES=20         # Max concurrent wallet analyses
```

### Capacity Estimation

**Developer Plan (50 RPS):**
- Concurrent users: **15-25** simultaneous analyses
- Queue activates: When 20+ users are analyzing

**To scale up:**
- Business Plan (200 RPS): Set `MAX_CONCURRENT_ANALYSES=80` → **60-100 concurrent users**
- Professional Plan (500 RPS): Set `MAX_CONCURRENT_ANALYSES=200` → **150-250 concurrent users**

## Monitoring Endpoints

Base URL: `http://localhost:3003/api/monitor`

### 1. System Status
**GET** `/api/monitor/status`

Returns comprehensive system metrics:
```json
{
  "timestamp": "2025-12-27T...",
  "concurrent": {
    "active": 5,
    "max": 20,
    "available": 15,
    "utilizationPercent": 25
  },
  "queue": {
    "waiting": 0,
    "active": 5,
    "completed": 100,
    "failed": 2,
    "hasCapacity": true,
    "estimatedWaitTime": 0
  },
  "performance": {
    "analysisDuration": {
      "avg": 25000,
      "min": 15000,
      "max": 45000
    }
  },
  "stats": {
    "total": 102,
    "completed": 100,
    "failed": 2,
    "successRate": 98
  },
  "activeAnalyses": [...]
}
```

### 2. Queue Statistics
**GET** `/api/monitor/queue`

Current queue status:
```json
{
  "waiting": 3,
  "active": 20,
  "completed": 150,
  "failed": 5,
  "maxConcurrent": 20,
  "hasCapacity": false,
  "estimatedWaitTime": 45
}
```

### 3. Job Status
**GET** `/api/monitor/queue/:jobId`

Check queued job status:
```json
{
  "status": "waiting",
  "position": 3,
  "data": {
    "walletAddress": "...",
    "requestedAt": "2025-12-27T..."
  },
  "estimatedWaitTime": 45
}
```

### 4. Cancel Queued Job
**DELETE** `/api/monitor/queue/:jobId`

Cancel a job in queue.

### 5. Active Analyses
**GET** `/api/monitor/active`

List all currently running analyses:
```json
{
  "count": 5,
  "analyses": [
    {
      "walletAddress": "abc123...",
      "duration": "15s",
      "startTime": "2025-12-27T..."
    }
  ]
}
```

### 6. Health Check
**GET** `/api/monitor/health`

Quick health status:
```json
{
  "status": "healthy",
  "active": 5,
  "max": 20,
  "queued": 0,
  "timestamp": "2025-12-27T..."
}
```

### 7. API Statistics
**GET** `/api/monitor/api-stats`

Endpoint performance metrics:
```json
{
  "analyze": {
    "totalRequests": 500,
    "errors": 10,
    "avgDuration": 250,
    "successRate": 98
  },
  "wallet": {...},
  "stats": {...}
}
```

### 8. Rate Limit Stats
**GET** `/api/monitor/rate-limits`

Rate limiter statistics:
```json
{
  "activeRateLimits": 15,
  "activeLocks": 5,
  "timestamp": "2025-12-27T..."
}
```

### 9. Reset Statistics
**POST** `/api/monitor/reset`

Reset all monitoring statistics (admin only - add auth in production).

## Queue Behavior

### When Queue Activates

When `active analyses >= MAX_CONCURRENT_ANALYSES`, new requests are queued:

**Request Response:**
```json
{
  "status": "queued",
  "progress": 0,
  "message": "Queued - Position 3 in line",
  "jobId": "analysis:abc123:1234567890",
  "queuePosition": 3,
  "estimatedWaitTime": 45,
  "walletAddress": "abc123..."
}
```

### Checking Queue Position

Client polls `/api/monitor/queue/:jobId` to check position and estimated wait time.

### When Queue Processes Job

The queue automatically starts the analysis when capacity becomes available. Client should continue polling `/api/analyze/:address/status` to detect when analysis starts.

## Frontend Integration

### Polling Example

```javascript
async function checkAnalysisStatus(walletAddress, jobId = null) {
  // If queued, check queue position
  if (jobId) {
    const queueStatus = await fetch(`/api/monitor/queue/${jobId}`);
    const data = await queueStatus.json();

    if (data.status === 'waiting') {
      return {
        status: 'queued',
        position: data.position,
        estimatedWait: data.estimatedWaitTime
      };
    }
  }

  // Check analysis status
  const response = await fetch(`/api/analyze/${walletAddress}/status`);
  return await response.json();
}
```

### Monitoring Dashboard

You can build a real-time dashboard using:
- `/api/monitor/status` - Overall system metrics
- `/api/monitor/active` - Live analyses
- `/api/monitor/queue` - Queue depth

Poll every 2-5 seconds for live updates.

## Testing

### Simulate Load

```bash
# Check current status
curl http://localhost:3003/api/monitor/status

# Start multiple analyses to fill capacity
for i in {1..25}; do
  curl -X POST http://localhost:3003/api/analyze \\
    -H "Content-Type: application/json" \\
    -d '{"walletAddress": "SOME_WALLET_ADDRESS"}'
done

# Check queue
curl http://localhost:3003/api/monitor/queue
```

### Monitor Health

```bash
# Quick health check
curl http://localhost:3003/api/monitor/health

# Full system status
curl http://localhost:3003/api/monitor/status | jq
```

## Production Recommendations

1. **Add Authentication**: Protect monitoring endpoints with API keys or JWT
2. **Enable Alerts**: Set up notifications when utilization > 80%
3. **Adjust Concurrency**: Fine-tune `MAX_CONCURRENT_ANALYSES` based on real usage
4. **Add Grafana/Datadog**: Export metrics to proper monitoring tools
5. **Queue Retention**: Configure Bull to clean up old jobs regularly

## Troubleshooting

### Queue Not Working
- Check Redis connection: `redis-cli ping`
- Verify Bull is installed: `npm list bull`
- Check logs for errors

### High Queue Times
- Consider upgrading Helius plan
- Increase `MAX_CONCURRENT_ANALYSES` (but stay within RPS limits)
- Optimize analysis code to reduce duration

### Monitoring Endpoints Not Responding
- Verify routes are registered in `server/src/index.js`
- Check server logs for errors
- Test Redis connectivity

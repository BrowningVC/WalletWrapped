# WalletWrapped

A Solana wallet analytics platform that generates shareable "year in review" style trading highlights.

## Features

- **No Login Required** - Analyze any Solana wallet address
- **Trading Highlights** - Shareable Twitter-optimized cards showcasing your biggest wins, losses, and achievements
- **Calendar View** - Daily P&L visualization with monthly/yearly views
- **SOL & USD Toggle** - View profits in either SOL or USD
- **Real-time Analysis** - Progress updates during wallet analysis
- **Accurate P&L** - FIFO cost basis calculation with unrealized gains tracking

## Tech Stack

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend:** Node.js, Express.js, Socket.io
- **Database:** PostgreSQL, Redis
- **Blockchain:** Helius Enhanced Transactions API
- **Job Queue:** Bull/BullMQ
- **Hosting:** Railway.app

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Helius API key ([get one here](https://helius.dev))

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/wallet-wrapped.git
cd wallet-wrapped
```

2. Install dependencies:
```bash
npm install
cd server && npm install
cd ../client && npm install
cd ..
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your actual values
```

4. Set up the database:
```bash
cd server
psql -U postgres -d walletwrapped -f src/database/schema.sql
```

5. Start development servers:
```bash
npm run dev
```

The API will be available at `http://localhost:3000` and the frontend at `http://localhost:3001`.

## Development

- `npm run dev` - Start both frontend and backend in development mode
- `npm run dev:server` - Start only the backend server
- `npm run dev:client` - Start only the frontend
- `npm run build` - Build the frontend for production
- `npm start` - Start the production server

## Project Structure

```
wallet-wrapped/
├── client/              # Next.js frontend
│   ├── app/            # App router pages
│   ├── components/     # React components
│   └── lib/            # Utilities and API client
├── server/             # Express.js backend
│   ├── src/
│   │   ├── config/     # Configuration
│   │   ├── database/   # Database schema and queries
│   │   ├── services/   # Business logic
│   │   ├── workers/    # Background jobs
│   │   ├── routes/     # API endpoints
│   │   └── socket/     # Socket.io handlers
└── README.md
```

## Deployment

Deploy to Railway.app:

1. Create a new project on Railway
2. Add PostgreSQL and Redis plugins
3. Set environment variables
4. Connect your GitHub repository
5. Railway will automatically deploy on push

## License

MIT

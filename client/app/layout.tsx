import type { Metadata, Viewport } from 'next';
import { Inter, Lexend } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const lexend = Lexend({
  subsets: ['latin'],
  variable: '--font-lexend',
  display: 'swap',
});

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.walletwrapped.io';

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: 'WalletWrapped - Your Solana Trading Year in Review',
  description: 'Unwrap your Solana wallet trading highlights. Shareable cards, P&L analytics, and trading insights for any wallet.',
  keywords: ['Solana', 'crypto', 'trading', 'analytics', 'wallet', 'highlights', 'wrapped'],
  authors: [{ name: 'WalletWrapped' }],
  openGraph: {
    title: 'WalletWrapped - Your Solana Trading Year in Review',
    description: 'Unwrap your Solana wallet trading highlights. Free, instant, no login required.',
    type: 'website',
    locale: 'en_US',
    url: baseUrl,
    siteName: 'WalletWrapped',
    images: [
      {
        url: '/api/og/default',
        width: 1200,
        height: 630,
        alt: 'WalletWrapped - Your 2025 Solana Trading Wrapped',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WalletWrapped - Your 2025 Solana Trading Wrapped',
    description: 'Unwrap your Solana wallet trading highlights. Free, instant, no login required.',
    images: ['/api/og/default'],
  },
  icons: {
    icon: '/favicon.svg',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${lexend.variable}`}>
      <body className="min-h-screen bg-dark-900 text-gray-100 antialiased">
        {children}
      </body>
    </html>
  );
}

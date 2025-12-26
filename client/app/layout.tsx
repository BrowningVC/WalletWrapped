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

export const metadata: Metadata = {
  title: 'WalletWrapped - Your Solana Trading Year in Review',
  description: 'Unwrap your Solana wallet trading highlights. Shareable cards, P&L analytics, and trading insights for any wallet.',
  keywords: ['Solana', 'crypto', 'trading', 'analytics', 'wallet', 'highlights', 'wrapped'],
  authors: [{ name: 'WalletWrapped' }],
  openGraph: {
    title: 'WalletWrapped - Your Solana Trading Year in Review',
    description: 'Unwrap your Solana wallet trading highlights',
    type: 'website',
    locale: 'en_US',
    siteName: 'WalletWrapped',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WalletWrapped',
    description: 'Your Solana trading year in review',
  },
  icons: {
    icon: '/favicon.ico',
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

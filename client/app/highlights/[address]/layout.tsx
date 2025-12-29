import type { Metadata } from 'next';

type Props = {
  params: Promise<{ address: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;

  // Base URL for production
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.walletwrapped.io';

  // Dynamic OG image URL
  const ogImageUrl = `${baseUrl}/api/og/${address}`;

  // Truncated address for display
  const shortAddress = `${address.slice(0, 4)}...${address.slice(-4)}`;

  return {
    title: `${shortAddress} - 2025 Wrapped | WalletWrapped`,
    description: `View the 2025 Solana trading highlights for wallet ${shortAddress}. Total P&L, biggest wins, win rate, and more.`,
    openGraph: {
      title: `${shortAddress}'s 2025 Trading Wrapped`,
      description: 'Check out my Solana trading year in review! Powered by WalletWrapped.',
      type: 'website',
      url: `${baseUrl}/highlights/${address}`,
      siteName: 'WalletWrapped',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${shortAddress} 2025 Trading Wrapped`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${shortAddress}'s 2025 Trading Wrapped`,
      description: 'Check out my Solana trading year in review! Powered by WalletWrapped.',
      images: [ogImageUrl],
    },
  };
}

export default function HighlightsLayout({ children }: Props) {
  return <>{children}</>;
}

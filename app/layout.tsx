import './globals.css';
import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';

const inter = Inter({ 
  subsets: ['latin'], 
  variable: '--font-sans',
  display: 'swap',
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Agent Saya — AI Sales Agents for Real Estate',
  description:
    'Subscribe to a ready-to-deploy AI sales agent tailored for your property project. QRIS checkout, WhatsApp onboarding, and instant access — all automated.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://agentsaya.site'),
  openGraph: {
    title: 'Agent Saya — AI Sales Agents for Real Estate',
    description:
      'Subscribe to a ready-to-deploy AI sales agent tailored for your property project.',
    images: [{ url: 'https://cdn.phototourl.com/free/2026-08-29-817dc217-a844-44c1-807b-d3aca6484c01.png' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [{ url: 'https://cdn.phototourl.com/free/2026-08-29-817dc217-a844-44c1-807b-d3aca6484c01.png' }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jakarta.variable} font-sans`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}

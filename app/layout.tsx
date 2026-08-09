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
  title: 'AgentKu — AI Sales Agents for Real Estate',
  description:
    'Subscribe to a ready-to-deploy AI sales agent tailored for your property project. QRIS checkout, WhatsApp onboarding, and instant access — all automated.',
  openGraph: {
    title: 'AgentKu — AI Sales Agents for Real Estate',
    description:
      'Subscribe to a ready-to-deploy AI sales agent tailored for your property project.',
    images: [{ url: 'https://bolt.new/static/og_default.png' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [{ url: 'https://bolt.new/static/og_default.png' }],
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

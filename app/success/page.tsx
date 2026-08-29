'use client';

if (process.env.NODE_ENV === 'development') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageSquare,
  Copy,
  Check,
  Home,
  Code,
  Link2,
  LayoutDashboard,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { buildEmbedCode } from '@/lib/agents';

interface SuccessData {
  status: string;
  slug: string | null;
  agentName: string | null;
  paymentStatus: string | null;
  periodEnd: string | null;
  trialEndsAt: string | null;
  planType: string | null;
}

function SuccessContent() {
  const params = useSearchParams();
  const ref = params.get('ref');
  const slugParam = params.get('slug');
  const [data, setData] = useState<SuccessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  useEffect(() => {
    if (!ref) {
      setError('Referensi transaksi tidak ditemukan di URL.');
      setLoading(false);
      return;
    }

    const isMockRef = typeof ref === 'string' && ref.startsWith('MOCK_');
    const isDev = process.env.NODE_ENV === 'development';

    if ((isMockRef || isDev) && slugParam) {
      setData({
        status: 'PAID',
        slug: slugParam,
        agentName: null,
        paymentStatus: 'PAID',
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        trialEndsAt: null,
        planType: 'basic',
      });
      setLoading(false);
      return;
    }

    // Handle trial flow - no need to poll transaction status
    if (ref === 'trial' && slugParam) {
      setData({
        status: 'TRIAL',
        slug: slugParam,
        agentName: null,
        paymentStatus: 'TRIAL',
        periodEnd: null,
        trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        planType: 'trial',
      });
      setLoading(false);
      return;
    }

    // Handle paid flow - poll transaction status
    let active = true;
    (async () => {
      for (let i = 0; i < 6; i++) {
        try {
          const res = await fetch(
            `/api/transaction/status?merchantRef=${ref}`
          );
          if (!res.ok) {
            const errorText = await res.text();
            console.error('Transaction status API error:', errorText);
            continue;
          }
          const json: SuccessData = await res.json();
          if (json.status === 'PAID') {
            if (active) {
              setData(json);
              setLoading(false);
            }
            return;
          }
        } catch {
          /* retry */
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (active) {
        setError(
          'Pembayaran belum terkonfirmasi. Jika Anda sudah bayar, cek kembali dalam beberapa menit.'
        );
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [ref, slugParam]);

  const slug = data?.slug || slugParam;
  const origin =
    typeof window !== 'undefined' ? window.location.origin : '';
  const chatUrl = slug ? `${origin}/chat/${slug}` : '';
  const embedCode = slug ? buildEmbedCode(slug, origin) : '';

  const expiry = data?.planType === 'trial' && data?.trialEndsAt
    ? new Date(data.trialEndsAt).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : data?.periodEnd
    ? new Date(data.periodEnd).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const waUrl = chatUrl
    ? `https://wa.me/?text=${encodeURIComponent(
        `AI Agent saya: ${chatUrl}`
      )}`
    : 'https://wa.me/';

  function copy(text: string, setter: (v: boolean) => void) {
    navigator.clipboard?.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 1500);
  }

  return (
    <>
      <Header />
      <main className="relative min-h-[70vh] overflow-hidden pt-32 pb-20">
        <div className="absolute inset-0 bg-radial-fade" aria-hidden />
        <div className="container relative">
          <div className="mx-auto max-w-lg">
            {loading && (
              <Card className="text-center">
                <CardContent className="flex flex-col items-center py-12">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="mt-4 font-display text-lg font-semibold">
                    Mengaktifkan AI Agent…
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Mohon tunggu, kami memverifikasi pembayaran Anda.
                  </p>
                </CardContent>
              </Card>
            )}

            {error && !loading && (
              <Card className="text-center">
                <CardContent className="flex flex-col items-center py-12">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                    <MessageSquare className="h-7 w-7 text-amber-600" />
                  </div>
                  <p className="font-display text-lg font-semibold">
                    Menunggu Konfirmasi
                  </p>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                    {error}
                  </p>
                  <Button asChild variant="outline" className="mt-6">
                    <a href="/">
                      <Home className="mr-2 h-4 w-4" /> Kembali ke Beranda
                    </a>
                  </Button>
                </CardContent>
              </Card>
            )}

            {data && !loading && (
              <Card className="overflow-hidden animate-scale-in">
                <div className={`bg-gradient-to-r px-6 py-8 text-center text-primary-foreground ${
                  data.planType === 'trial' 
                    ? 'from-amber-500 to-orange-500' 
                    : 'from-primary to-emerald-500'
                }`}>
                  <CheckCircle2 className="mx-auto h-14 w-14" />
                  <h1 className="mt-3 font-display text-2xl font-bold">
                    {data.planType === 'trial' ? 'Free Trial Dimulai!' : 'AI Agent Aktif!'}
                  </h1>
                  <p className="mt-1 text-sm text-primary-foreground/90">
                    {data.planType === 'trial' 
                      ? 'Coba AI Agent gratis selama 3 hari'
                      : `${data.agentName} siap melayani pelanggan Anda`}
                  </p>
                </div>

                <CardContent className="space-y-5 p-6">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-muted-foreground">Status</p>
                      <p className="mt-0.5 font-semibold text-primary">
                        {data.planType === 'trial' ? 'Free Trial' : 'Aktif'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-muted-foreground">
                        {data.planType === 'trial' ? 'Berlaku hingga' : 'Berlaku hingga'}
                      </p>
                      <p className="mt-0.5 font-semibold">{expiry}</p>
                    </div>
                  </div>

                  {data.planType === 'trial' && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm font-medium text-amber-800">
                        🎉 Selamat menikmati free trial 3 hari!
                      </p>
                      <p className="mt-1 text-xs text-amber-700">
                        Setelah masa trial berakhir, Anda bisa upgrade ke paket berbayar untuk melanjutkan menggunakan AI Agent.
                      </p>
                    </div>
                  )}

                  {/* Shareable link */}
                  <div className="rounded-xl border bg-card p-4">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Link2 className="h-3.5 w-3.5" />
                      Link AI Agent Anda
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate rounded bg-muted/60 px-2 py-1.5 text-xs">
                        {chatUrl}
                      </code>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => copy(chatUrl, setCopiedLink)}
                        aria-label="Copy link"
                      >
                        {copiedLink ? (
                          <Check className="h-4 w-4 text-primary" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Embed code */}
                  <div className="rounded-xl border bg-card p-4">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Code className="h-3.5 w-3.5" />
                      Embed Code untuk Website
                    </div>
                    <pre className="overflow-x-auto rounded bg-muted/60 px-3 py-2 text-xs leading-relaxed">
                      {embedCode}
                    </pre>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full"
                      onClick={() => copy(embedCode, setCopiedEmbed)}
                    >
                      {copiedEmbed ? (
                        <>
                          <Check className="mr-2 h-3.5 w-3.5 text-primary" />
                          Embed code disalin
                        </>
                      ) : (
                        <>
                          <Copy className="mr-2 h-3.5 w-3.5" />
                          Copy Embed Code
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      asChild
                      size="lg"
                      className="flex-1 font-semibold"
                    >
                      <a href={chatUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Buka AI Agent
                      </a>
                    </Button>
                    <Button
                      asChild
                      size="lg"
                      variant="outline"
                      className="flex-1 font-semibold"
                    >
                      <a href={waUrl} target="_blank" rel="noopener noreferrer">
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Open in WhatsApp
                      </a>
                    </Button>
                  </div>

                  <Button
                    asChild
                    variant="outline"
                    className="w-full"
                  >
                    <a href="/dashboard">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Ke Dashboard Saya
                    </a>
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">
                    Link & embed code juga dikirim ke WhatsApp & email Anda.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}

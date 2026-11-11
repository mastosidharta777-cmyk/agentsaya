'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type OrderState = {
  status: string; checkoutUrl: string | null; sandbox: boolean;
  agentName: string | null; slug: string | null;
};
function PaymentStatus() {
  const ref = useSearchParams().get('ref');
  const [order, setOrder] = useState<OrderState | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (!ref) { setError('Referensi pesanan tidak ditemukan.'); setChecking(false); return; }
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/transaction/status?merchantRef=' + encodeURIComponent(ref), { cache: 'no-store' });
        const data = await res.json();
        if (!active) return;
        if (!res.ok) { setError(data.error || 'Tidak dapat memeriksa pembayaran.'); return; }
        setError('');
        setOrder(data);
        if (data.status === 'PAID' && data.slug) {
          window.location.replace('/success?ref=' + encodeURIComponent(ref));
        }
      } catch { if (active) setError('Koneksi terputus. Coba lagi.'); }
      finally { if (active) setChecking(false); }
    };
    void poll();
    const interval = setInterval(() => { void poll(); }, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [ref]);
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <section className="max-w-lg w-full rounded-2xl border bg-card p-6 shadow-sm space-y-5">
        <a href="/" className="text-sm text-primary">← AGENTSAYA</a>
        <h1 className="text-2xl font-bold">Pembayaran Mayar</h1>
        <p className="text-sm text-muted-foreground">
          {order?.agentName ? 'AI Agent: ' + order.agentName : 'Memeriksa pesanan...'}
        </p>
        {order?.sandbox && (
          <p className="text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-900 p-3">
            Mode sandbox. Pembayaran percobaan tidak mengaktifkan langganan sungguhan.
          </p>
        )}
        {order?.checkoutUrl && (
          <a href={order.checkoutUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex w-full justify-center rounded-lg bg-primary px-5 py-3 text-primary-foreground font-semibold">
            Buka halaman pembayaran Mayar
          </a>
        )}
        <p className="text-sm text-muted-foreground">
          Halaman pembayaran akan terbuka di tab baru. Kembali ke tab ini setelah membayar.
          Status diperiksa otomatis setiap 15 detik.
        </p>
        <p className="text-sm">{checking ? 'Mengambil status...' :
          order?.status === 'PAID' ? 'Pembayaran berhasil. Membuka AI Agent...' :
          'Menunggu konfirmasi pembayaran.'}</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <a className="text-sm text-primary underline" href="/dashboard">Ke dashboard</a>
      </section>
    </main>
  );
}
export default function PaymentPage() {
  return <Suspense fallback={<main className="p-8">Memuat pembayaran...</main>}><PaymentStatus /></Suspense>;
}

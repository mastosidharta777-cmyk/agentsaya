'use client';

import { useState } from 'react';
import { Loader2, Sparkles, Check, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BASIC_PLAN, YEARLY_PLAN, formatRupiah } from '@/lib/plans';

interface CheckoutFormProps {
  slug: string;
  agentName: string;
  welcomeMessage: string;
  knowledgeBase: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  isRenewal: boolean;
  preselectedPlan: 'trial' | 'monthly' | 'yearly';
}

type PlanType = 'monthly' | 'yearly';

export function CheckoutForm({
  slug,
  agentName,
  welcomeMessage,
  knowledgeBase,
  ownerName,
  ownerEmail,
  ownerPhone,
  isRenewal,
  preselectedPlan,
}: CheckoutFormProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanType>(
    preselectedPlan === 'yearly' ? 'yearly' : 'monthly'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async () => {
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('agentName', agentName);
      formData.append('knowledgeBase', knowledgeBase);
      formData.append('welcomeMessage', welcomeMessage);
      formData.append('name', ownerName);
      formData.append('email', ownerEmail);
      formData.append('phone', ownerPhone);
      formData.append('planType', selectedPlan);
      formData.append('slug', slug);
      formData.append('renewal', isRenewal ? 'true' : 'false');

      const res = await fetch('/api/checkout', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          setError(data.error || 'Gagal membuat pembayaran');
        } catch {
          setError('Gagal membuat pembayaran');
        }
        return;
      }

      const data = await res.json();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        setError('Tidak ada URL pembayaran yang dikembalikan');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{isRenewal ? 'Pilih Paket Perpanjangan' : 'Pilih Paket'}</h1>
          <p className="text-muted-foreground mt-1">
            Agent: <strong>{agentName}</strong>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            className={`relative p-4 sm:p-5 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
              selectedPlan === 'monthly' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
            onClick={() => setSelectedPlan('monthly')}
          >
            <div className="flex flex-col">
              <div className="font-semibold text-base">Bulanan</div>
              <div className="text-xs text-slate-500 mt-1">Aktif 30 hari</div>
              <div className="mt-2 text-base sm:text-lg font-bold text-primary">
                {formatRupiah(BASIC_PLAN.priceMonthly)}
              </div>
            </div>
            {selectedPlan === 'monthly' && (
              <div className="absolute -top-2.5 right-2 px-2.5 py-0.5 text-[10px] font-bold rounded-full shadow-sm bg-primary text-white">
                Dipilih
              </div>
            )}
          </div>

          <div
            className={`relative p-4 sm:p-5 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
              selectedPlan === 'yearly' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
            onClick={() => setSelectedPlan('yearly')}
          >
            <div className="absolute -top-2.5 right-2 px-2.5 py-0.5 text-[10px] font-bold rounded-full shadow-sm bg-emerald-500 text-white">
              Hemat 32%
            </div>
            <div className="flex flex-col">
              <div className="font-semibold text-base">Tahunan</div>
              <div className="text-xs text-slate-500 mt-1">Aktif 365 hari</div>
              <div className="mt-2 text-base sm:text-lg font-bold text-primary">
                {formatRupiah(YEARLY_PLAN.priceMonthly)}
              </div>
            </div>
            {selectedPlan === 'yearly' && (
              <div className="absolute -top-2.5 right-2 px-2.5 py-0.5 text-[10px] font-bold rounded-full shadow-sm bg-primary text-white">
                Dipilih
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <Button
          onClick={handlePay}
          disabled={loading}
          size="lg"
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Memproses...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Bayar Sekarang ({selectedPlan === 'yearly' ? formatRupiah(YEARLY_PLAN.priceMonthly) : formatRupiah(BASIC_PLAN.priceMonthly)})
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Pembayaran via QRIS, Transfer Bank, atau E-Wallet. Aktivasi instan setelah pembayaran.
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-sm">Ringkasan Pesanan</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Agent</span>
                <span className="font-medium text-right">{agentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paket</span>
                <span className="font-medium">{selectedPlan === 'yearly' ? 'Tahunan' : 'Bulanan'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Durasi</span>
                <span className="font-medium">{selectedPlan === 'yearly' ? '365 hari' : '30 hari'}</span>
              </div>
              <div className="flex justify-between border-t pt-2 mt-2">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-primary">
                  {selectedPlan === 'yearly' ? formatRupiah(YEARLY_PLAN.priceMonthly) : formatRupiah(BASIC_PLAN.priceMonthly)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-xs text-muted-foreground space-y-2">
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-primary flex-none mt-0.5" />
              <span>1 AI Agent custom dengan knowledge base Anda</span>
            </div>
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-primary flex-none mt-0.5" />
              <span>Link chat shareable + embed code website</span>
            </div>
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-primary flex-none mt-0.5" />
              <span>Aktivasi instan setelah pembayaran</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

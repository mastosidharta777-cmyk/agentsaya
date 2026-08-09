'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  CheckCircle2,
  Clock,
  Loader2,
  QrCode,
  Sparkles,
  Upload,
  X,
  FileText,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

interface QrisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: {
    transactionId: string;
    agentId?: string;
    merchantRef: string;
    reference: string;
    slug: string;
    qrisString: string;
    qrImageUrl?: string;
    amount: number;
    amountFormatted: string;
    agentName: string;
    sandbox: boolean;
  } | null;
}

type PayState = 'pending' | 'paid' | 'uploading' | 'verifying' | 'simulating';

export function QrisDialog({ open, onOpenChange, payload }: QrisDialogProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(true);
  const [payState, setPayState] = useState<PayState>('pending');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open || !payload) return;
    stopRef.current = false;
    setPayState('pending');
    setQrLoading(true);
    setReceiptFile(null);
    setUploadError(null);

    async function genQr() {
      if (!payload) return;
      try {
        // Use static QRIS image if available, otherwise generate QR code
        const staticQrisUrl = '/qris.png';
        const imgCheck = await fetch(staticQrisUrl, { method: 'HEAD' });
        
        if (imgCheck.ok) {
          setQrDataUrl(staticQrisUrl);
        } else if (payload.qrImageUrl) {
          setQrDataUrl(payload.qrImageUrl);
        } else {
          const url = await QRCode.toDataURL(payload.qrisString, {
            width: 280,
            margin: 1,
            color: { dark: '#0f172a', light: '#ffffff' },
          });
          setQrDataUrl(url);
        }
      } catch {
        setQrDataUrl(null);
      } finally {
        setQrLoading(false);
      }
    }
    genQr();

    return () => {
      stopRef.current = true;
      stopPolling();
    };
  }, [open, payload, stopPolling]);

  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload an image file (JPG, PNG, etc.)');
      return;
    }

    if (!payload) {
      setUploadError('Payment information not available');
      return;
    }

    setReceiptFile(file);
    setUploadError(null);
    setPayState('uploading');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('merchantRef', payload.merchantRef);
      formData.append('amount', payload.amount.toString());
      if (payload.agentId) {
        formData.append('agentId', payload.agentId);
      }

      const res = await fetch('/api/checkout/verify-receipt', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Receipt verification failed');
      }

      const data = await res.json();
      if (data.success) {
        setPayState('paid');
      } else {
        setUploadError(data.error || 'Receipt verification failed');
        setPayState('pending');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Receipt verification failed';
      setUploadError(message);
      setPayState('pending');
    }
  }

  function removeReceipt() {
    setReceiptFile(null);
    setUploadError(null);
  }

  async function handleSimulate() {
    if (!payload) return;
    setPayState('simulating');
    
    try {
      const res = await fetch('/api/simulate-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantRef: payload.merchantRef }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Simulasi pembayaran gagal');
      }

      const data = await res.json();
      
      if (data.success) {
        // Simulasi singkat untuk UX
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Redirect ke halaman success
        onOpenChange(false);
        window.location.href = `/success?ref=${payload.merchantRef}&slug=${payload.slug}`;
      } else {
        throw new Error(data.error || 'Simulasi pembayaran gagal');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Simulasi pembayaran gagal';
      console.error('Simulate payment error:', message);
      setUploadError(message);
      setPayState('pending');
    } finally {
      // Pastikan state selalu di-reset
      if (payState === 'simulating') {
        setPayState('pending');
      }
    }
  }

  function handleViewSuccess() {
    if (!payload) return;
    onOpenChange(false);
    window.location.href = `/success?ref=${payload.merchantRef}&slug=${payload.slug}`;
  }

  if (!payload) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <DialogTitle className="sr-only">Pembayaran QRIS</DialogTitle>

        {payState === 'paid' ? (
          <div className="flex flex-col items-center px-6 py-10 text-center animate-scale-in">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-9 w-9 text-primary" />
            </div>
            <h2 className="font-display text-2xl font-bold">
              AI Agent Aktif!
            </h2>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              <strong>{payload.agentName}</strong> sudah aktif. Link chat &
              embed code telah dikirim ke WhatsApp & email Anda.
            </p>
            <Button
              onClick={handleViewSuccess}
              size="lg"
              className="mt-6 w-full font-semibold"
            >
              Lihat Link AI Agent
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-8">
            <div className="mb-1 flex items-center gap-2 text-primary">
              <QrCode className="h-5 w-5" />
              <span className="text-sm font-semibold tracking-wide uppercase">
                Transfer QRIS
              </span>
            </div>
            <p className="mb-5 text-xs text-muted-foreground">
              {payload.agentName} · {payload.amountFormatted}
            </p>

            <div className="relative rounded-2xl border-2 border-primary/20 bg-white p-4">
              {qrLoading ? (
                <Skeleton className="h-[280px] w-[280px] rounded-lg" />
              ) : qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="QRIS code"
                  width={280}
                  height={280}
                  className="rounded-lg"
                />
              ) : (
                <div className="flex h-[280px] w-[280px] items-center justify-center text-sm text-muted-foreground">
                  QR gagal dimuat
                </div>
              )}
            </div>

            <div className="mt-5 w-full">
              <Label htmlFor="receipt" className="text-sm font-medium">
                Bukti Transfer (Wajib)
              </Label>
              <div className="mt-2">
                <Input
                  id="receipt"
                  type="file"
                  accept="image/*"
                  onChange={handleReceiptUpload}
                  disabled={payState === 'uploading' || payState === 'verifying'}
                  className="cursor-pointer"
                />
                {receiptFile && (
                  <div className="mt-2 flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 flex-1">
                      <FileText className="h-4 w-4" />
                      <span className="truncate">{receiptFile.name}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={removeReceipt}
                      disabled={payState === 'uploading' || payState === 'verifying'}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              {uploadError && (
                <p className="mt-2 text-xs text-destructive">{uploadError}</p>
              )}
            </div>

            {payState === 'uploading' || payState === 'verifying' ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {payState === 'uploading' ? 'Mengupload bukti...' : 'Memverifikasi pembayaran...'}
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Upload bukti transfer untuk aktivasi otomatis
              </div>
            )}

            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Transfer ke QRIS di atas, lalu upload bukti
            </div>

            {payload.sandbox && (
              <div className="mt-5 w-full rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  MODE DEMO — OCR belum terkonfigurasi
                </div>
                <Button
                  onClick={handleSimulate}
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  disabled={payState === 'simulating'}
                >
                  {payState === 'simulating' ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Menyimulasikan…
                    </>
                  ) : (
                    'Simulasikan Pembayaran Berhasil'
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

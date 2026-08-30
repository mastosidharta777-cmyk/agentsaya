'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Bot, Sparkles, FileText, MessageSquare, Upload, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { BASIC_PLAN, TRIAL_PLAN, YEARLY_PLAN, formatRupiah } from '@/lib/plans';
import { QrisDialog } from './QrisDialog';

interface CheckoutPayload {
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
}

const DEFAULT_WELCOME = (name: string) =>
  `Halo! Saya Asisten Virtual ${name || 'AI'}. Ada yang bisa saya bantu hari ini?`;

export function AgentBuilderForm() {
  const searchParams = useSearchParams();
  const [agentName, setAgentName] = useState('');
  const [knowledgeBase, setKnowledgeBase] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<CheckoutPayload | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'trial' | 'monthly' | 'yearly'>('monthly');
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  const [pdfExtractError, setPdfExtractError] = useState<string | null>(null);

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      setReferralCode(ref);
    }
  }, [searchParams]);

  // Reset form when dialog closes (successful payment)
  useEffect(() => {
    if (!dialogOpen && payload) {
      // Reset form fields after successful payment
      setAgentName('');
      setKnowledgeBase('');
      setWelcomeMessage('');
      setName('');
      setEmail('');
      setPhone('');
      setUploadedFiles([]);
      setAdditionalNotes('');
      setExtractedText('');
      setSelectedPdfFile(null);
      setError(null);
      setSubmitAttempted(false);
    }
  }, [dialogOpen, payload]);

  async function extractTextFromFile(file: File): Promise<string> {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (extension === 'txt') {
      try {
        return await file.text();
      } catch (err) {
        throw new Error('Gagal membaca file TXT');
      }
    } else if (extension === 'pdf') {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/extract-pdf', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          const errorText = await res.text();
          console.error('PDF extraction API error:', errorText);
          try {
            const errorData = JSON.parse(errorText);
            throw new Error(errorData.error || 'Gagal mengekstrak teks PDF');
          } catch {
            throw new Error('Gagal mengekstrak teks PDF');
          }
        }
        
        const data = await res.json();
        return data.text;
      } catch (err) {
        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            throw new Error('Gagal membaca file PDF: timeout');
          }
          throw err;
        }
        throw new Error('Gagal membaca file PDF');
      }
    } else {
      throw new Error('Unsupported file type. Please upload PDF or TXT files.');
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles = files.filter(file => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return extension === 'pdf' || extension === 'txt';
    });

    if (validFiles.length !== files.length) {
      setError('Some files were skipped. Only PDF and TXT files are supported.');
    }

    const pdfFile = validFiles.find(file => file.name.split('.').pop()?.toLowerCase() === 'pdf');
    if (pdfFile) {
      setSelectedPdfFile(pdfFile);
    }

    setUploadedFiles(prev => [...prev, ...validFiles]);
    setPdfExtractError(null);

    setIsExtracting(true);
    try {
      const texts = await Promise.all(validFiles.map(extractTextFromFile));
      setExtractedText(prev => prev + '\n\n' + texts.join('\n\n'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to extract text from files';
      setPdfExtractError('Gagal membaca file PDF, silakan masukkan teks manual');
      console.error('[PDF EXTRACT]', message);
    } finally {
      setIsExtracting(false);
    }
  }

  async function removeFile(index: number) {
    const removedFile = uploadedFiles[index];
    const remainingFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(remainingFiles);
    
    if (removedFile.name.split('.').pop()?.toLowerCase() === 'pdf') {
      setSelectedPdfFile(null);
    }
    
    const nextPdfFile = remainingFiles.find(file => file.name.split('.').pop()?.toLowerCase() === 'pdf');
    if (nextPdfFile) {
      setSelectedPdfFile(nextPdfFile);
    }
    
    if (remainingFiles.length > 0) {
      setIsExtracting(true);
      setPdfExtractError(null);
      try {
        const texts = await Promise.all(remainingFiles.map(extractTextFromFile));
        setExtractedText(texts.join('\n\n'));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to re-extract text';
        setPdfExtractError('Gagal membaca file PDF, silakan masukkan teks manual');
        console.error('[PDF RE-EXTRACT]', message);
      } finally {
        setIsExtracting(false);
      }
    } else {
      setExtractedText('');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    setError(null);
    
    // Check required fields
    if (!agentName || !name || !email || !phone) {
      setError('Mohon lengkapi semua kolom yang wajib diisi.');
      return;
    }
    
    // Check if at least one knowledge source is present
    const hasKnowledgeBase = knowledgeBase.trim().length > 0;
    const hasAdditionalNotes = additionalNotes.trim().length > 0;
    const hasUploadedFiles = uploadedFiles.length > 0;
    const hasPdfFile = selectedPdfFile !== null;
    
    if (!hasKnowledgeBase && !hasAdditionalNotes && !hasUploadedFiles && !hasPdfFile) {
      setError('Mohon isi salah satu: Knowledge Base, upload file, atau Instruksi Khusus.');
      return;
    }
    
    // Combine knowledge base with extracted text and additional notes
    const combinedContext = [
      knowledgeBase,
      extractedText,
      additionalNotes
    ].filter(Boolean).join('\n\n');
    
    console.log('Combined context length:', combinedContext.length);
    console.log('Uploaded files count:', uploadedFiles.length);
    console.log('Has PDF file:', selectedPdfFile !== null);
    console.log('Has extracted text:', extractedText.length > 0);
    
    // Skip character validation if files are uploaded or PDF is selected
    if (uploadedFiles.length === 0 && selectedPdfFile === null && combinedContext.trim().length < 20) {
      setError('Total konteks minimal 20 karakter.');
      return;
    }
    
    setLoading(true);
    try {
      // Prepare form data for submission
      const formData = new FormData();
      formData.append('agentName', agentName);
      formData.append('knowledgeBase', combinedContext);
      formData.append('welcomeMessage', welcomeMessage);
      formData.append('additionalNotes', additionalNotes);
      formData.append('name', name);
      formData.append('email', email);
      formData.append('phone', phone);
      if (referralCode) {
        formData.append('referralCode', referralCode);
      }
      formData.append('planType', selectedPlan);
      
      // Append PDF file if selected
      if (selectedPdfFile) {
        formData.append('pdfFile', selectedPdfFile);
        console.log('Appending PDF file to FormData:', selectedPdfFile.name);
      }

      // For trial plan, directly create agent without payment
      if (selectedPlan === 'trial') {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          body: formData,
        });
        
        console.log('Trial checkout response status:', res.status);
        
        if (!res.ok) {
          const errorText = await res.text();
          console.error('Checkout API error:', errorText);
          try {
            const errorData = JSON.parse(errorText);
            console.error('Parsed error data:', errorData);
            throw new Error(errorData.error || 'Gagal membuat trial');
          } catch {
            throw new Error('Gagal membuat trial');
          }
        }
        
        const data = await res.json();
        console.log('Trial checkout response data:', data);
        
        // Redirect to success page with agent info
        if (data.slug) {
          window.location.href = `/success?ref=trial&slug=${data.slug}`;
        } else {
          throw new Error('Gagal membuat trial: tidak ada slug yang dikembalikan');
        }
      } else {
        // For paid plan, show QRIS modal
        const res = await fetch('/api/checkout', {
          method: 'POST',
          body: formData,
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          console.error('Checkout API error:', errorText);
          try {
            const errorData = JSON.parse(errorText);
            throw new Error(errorData.error || 'Gagal membuat pembayaran');
          } catch {
            throw new Error('Gagal membuat pembayaran');
          }
        }
        
        const data = await res.json();
        if (data.success === false) {
          throw new Error(data.error || 'Gagal membuat pembayaran');
        }

        // iPaymu returns a redirect Payment URL — send the user straight to it.
        if (data.paymentUrl) {
          window.location.href = data.paymentUrl;
          return;
        }

        // Fallback to QRIS modal if no redirect URL is provided.
        setPayload(data);
        setDialogOpen(true);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="checkout" className="relative scroll-mt-24">
      <div className="mx-auto max-w-3xl">
        <Card className="overflow-hidden shadow-xl shadow-primary/5">
          <CardContent className="grid gap-0 p-0 md:grid-cols-[1fr_300px]">
            {/* ── Form ── */}
            <div className="p-6 sm:p-8">
              <div className="mb-6 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold tracking-tight">
                    Buat AI Agent
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Isi detail bisnis, bayar via QRIS/Transfer/E-Wallet, agen langsung aktif.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Plan Selection */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Pilih Paket</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 relative pt-3">
                    {/* Trial Plan */}
                    <div
                      className={`relative p-4 sm:p-5 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
                        selectedPlan === 'trial'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => setSelectedPlan('trial')}
                    >
                      <div className="flex flex-col">
                        <div className="font-semibold text-base">Free Trial 3 Hari</div>
                        <div className="text-xs text-slate-500 mt-1">Coba gratis dulu</div>
                        <div className="mt-2 text-lg sm:text-xl font-extrabold text-primary">GRATIS</div>
                      </div>
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <Check className="h-3.5 w-3.5 text-primary" />
                          <span>Full akses 3 hari</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Check className="h-3.5 w-3.5 text-primary" />
                          <span>Upgrade kapan saja</span>
                        </div>
                      </div>
                      {selectedPlan === 'trial' && (
                        <div className="absolute -top-2.5 right-2 px-2.5 py-0.5 text-[10px] font-bold rounded-full shadow-sm bg-primary text-white">
                          Dipilih
                        </div>
                      )}
                    </div>

                    {/* Monthly Plan */}
                    <div
                      className={`relative p-4 sm:p-5 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
                        selectedPlan === 'monthly'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
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
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <Check className="h-3.5 w-3.5 text-primary" />
                          <span>Aktif instan</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Check className="h-3.5 w-3.5 text-primary" />
                          <span>30 hari penuh</span>
                        </div>
                      </div>
                      {selectedPlan === 'monthly' && (
                        <div className="absolute -top-2.5 right-2 px-2.5 py-0.5 text-[10px] font-bold rounded-full shadow-sm bg-primary text-white">
                          Dipilih
                        </div>
                      )}
                    </div>

                    {/* Yearly Plan */}
                    <div
                      className={`relative p-4 sm:p-5 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
                        selectedPlan === 'yearly'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
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
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <Check className="h-3.5 w-3.5 text-primary" />
                          <span>Aktif instan</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Check className="h-3.5 w-3.5 text-primary" />
                          <span>365 hari penuh</span>
                        </div>
                      </div>
                      {selectedPlan === 'yearly' && (
                        <div className="absolute -top-2.5 right-16 px-2.5 py-0.5 text-[10px] font-bold rounded-full shadow-sm bg-primary text-white">
                          Dipilih
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="agentName">
                    Nama Agent / Bisnis
                  </Label>
                  <Input
                    id="agentName"
                    placeholder="Sales Ruko Serpong"
                    value={agentName}
                    onChange={(e) => {
                      setAgentName(e.target.value);
                      if (!welcomeMessage) {
                        setWelcomeMessage(DEFAULT_WELCOME(e.target.value));
                      }
                    }}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="knowledgeBase">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Knowledge Base / Context
                    </span>
                  </Label>
                  <Textarea
                    id="knowledgeBase"
                    placeholder="Masukkan detail produk, daftar harga, FAQ, atau aturan bisnis Anda di sini…&#10;&#10;Contoh:&#10;- Ruko Serpong Type A: 4x12m, 2 lantai, harga Rp 1.2M&#10;- DP 20%, KPR 80%&#10;- Lokasi: BSD City, Tangerang Selatan"
                    value={knowledgeBase}
                    onChange={(e) => setKnowledgeBase(e.target.value)}
                    rows={6}
                    className="resize-y"
                  />
                  <p className="text-xs text-muted-foreground">
                    {knowledgeBase.length} karakter · Opsional jika upload file atau isi instruksi khusus
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="fileUpload">
                    <span className="flex items-center gap-1.5">
                      <Upload className="h-3.5 w-3.5" />
                      Upload PDF/TXT (Opsional)
                    </span>
                  </Label>
                  <Input
                    id="fileUpload"
                    type="file"
                    accept=".pdf,.txt"
                    multiple
                    onChange={handleFileUpload}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground">
                    Upload file PDF atau TXT untuk menambahkan konteks otomatis
                  </p>
                  <p className="text-xs text-muted-foreground">
                    💡 Disarankan PDF berbasis teks (tanpa batas halaman, maks 10MB). PDF hasil scan/gambar maksimal 3 halaman.
                  </p>
                  {isExtracting && (
                    <p className="text-xs text-primary flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Mengekstrak teks dari file...
                    </p>
                  )}
                  {pdfExtractError && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                      {pdfExtractError}
                    </p>
                  )}
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {uploadedFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2 text-sm"
                        >
                          <span className="truncate flex-1">{file.name}</span>
                           <Button
                             type="button"
                             variant="ghost"
                             size="sm"
                             className="h-6 w-6 p-0"
                             onClick={() => removeFile(index)}
                           >
                             <X className="h-4 w-4" />
                           </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="additionalNotes">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Instruksi Khusus / Note (Opsional)
                    </span>
                  </Label>
                  <Textarea
                    id="additionalNotes"
                    placeholder="Tambahkan instruksi khusus atau catatan tambahan di sini…"
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    rows={3}
                    className="resize-y"
                  />
                  <p className="text-xs text-muted-foreground">
                    Catatan ini akan digabungkan dengan knowledge base dan konteks dari file yang diupload
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="welcomeMessage">
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Welcome Message
                    </span>
                  </Label>
                  <Textarea
                    id="welcomeMessage"
                    placeholder="Pesan sambutan pertama untuk pengunjung…"
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Pesan pertama yang dilihat pengunjung di chat. Default
                    terisi otomatis.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Nama Anda</Label>
                    <Input
                      id="name"
                      placeholder="Budi"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="budi@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">WhatsApp</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="0812 3456 7890"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                      required
                    />
                  </div>
                </div>

                {error && submitAttempted && (
                  <p className="text-sm font-medium text-destructive">{error}</p>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full font-semibold"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {selectedPlan === 'trial' ? 'Mulai Free Trial 3 Hari (GRATIS)' : selectedPlan === 'yearly' ? `Buat & Aktifkan Paket Tahunan (${formatRupiah(YEARLY_PLAN.priceMonthly)})` : `Buat & Aktifkan AI Agent (${formatRupiah(BASIC_PLAN.priceMonthly)})`}
                    </>
                  ) : selectedPlan === 'trial' ? (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Mulai Free Trial 3 Hari (GRATIS)
                    </>
                  ) : selectedPlan === 'yearly' ? (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Buat & Aktifkan Paket Tahunan ({formatRupiah(YEARLY_PLAN.priceMonthly)})
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Buat & Aktifkan AI Agent ({formatRupiah(BASIC_PLAN.priceMonthly)})
                    </>
                  )}
                </Button>
              </form>
            </div>

            {/* ── Plan sidebar ── */}
            <div className="border-t bg-muted/30 p-6 md:border-l md:border-t-0 md:p-6">
              <div className="sticky top-24 space-y-4">
                <div className="rounded-xl border bg-card p-4 sm:p-5">
                  <span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    {selectedPlan === 'trial' ? TRIAL_PLAN.name : selectedPlan === 'yearly' ? YEARLY_PLAN.name : BASIC_PLAN.name}
                  </span>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">
                      {selectedPlan === 'trial' ? 'GRATIS' : selectedPlan === 'yearly' ? formatRupiah(YEARLY_PLAN.priceMonthly) : formatRupiah(BASIC_PLAN.priceMonthly)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {selectedPlan === 'trial' ? '/3 hari' : selectedPlan === 'yearly' ? '/tahun' : '/bln'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selectedPlan === 'trial' ? TRIAL_PLAN.description : selectedPlan === 'yearly' ? YEARLY_PLAN.description : BASIC_PLAN.description}
                  </p>
                  <ul className="mt-4 space-y-2">
                    {(selectedPlan === 'trial' ? TRIAL_PLAN.features : selectedPlan === 'yearly' ? YEARLY_PLAN.features : BASIC_PLAN.features).map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 flex-none text-primary" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 text-center">
                  <p className="text-xs font-medium text-primary">
                    {selectedPlan === 'trial' 
                      ? 'Aktif instan tanpa pembayaran' 
                      : 'Aktivasi instan setelah pembayaran QRIS/Transfer/E-Wallet'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Link chat + embed code dikirim via WhatsApp & email
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <QrisDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        payload={payload}
      />
    </div>
  );
}

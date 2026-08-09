'use client';

import { ArrowRight, Bot, MessageSquare, Zap, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20">
      <div className="absolute inset-0 bg-grid opacity-60" aria-hidden />
      <div className="absolute inset-0 bg-radial-fade" aria-hidden />
      <div className="absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" aria-hidden />

      <div className="container relative">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card/60 px-4 py-1.5 text-sm font-medium shadow-sm backdrop-blur animate-fade-in">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            Buat AI Agent untuk bisnis apa pun — mulai Rp 49.000
          </div>

          <h1 className="font-display text-4xl font-extrabold leading-[1.1] tracking-tight text-balance sm:text-5xl md:text-6xl animate-fade-up">
            Bangun AI Agent Sendiri untuk{' '}
            <span className="bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
              Bisnis Anda
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground text-balance animate-fade-up [animation-delay:100ms]">
            Masukkan detail bisnis Anda — produk, harga, FAQ — dan dapatkan AI
            agent yang menjawab pelanggan 24/7 di link chat sendiri. Bayar
            QRIS, langsung aktif, siap dibagikan & dipasang di website.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row animate-fade-up [animation-delay:200ms]">
            <Button asChild size="lg" className="group font-semibold">
              <a href="#checkout">
                <Wand2 className="mr-2 h-4 w-4" />
                Buat AI Agent Sekarang
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how">Lihat Cara Kerja</a>
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground animate-fade-in [animation-delay:400ms]">
            <span className="inline-flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-primary" /> Aktivasi instan
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 text-primary" /> Link shareable
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Bot className="h-4 w-4 text-primary" /> 24/7 otomatis
            </span>
          </div>
        </div>

        {/* floating mock cards */}
        <div className="relative mx-auto mt-16 max-w-4xl animate-fade-up [animation-delay:300ms]">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: Wand2,
                title: 'Anda Isi',
                body: ' "Jual ruko Serpong, type A 4x12m, Rp 1.2M, DP 20%…"',
                tone: 'bg-primary',
              },
              {
                icon: Bot,
                title: 'AI Agent Terbentuk',
                body: ' Link: agentku.id/chat/sales-ruko-serpong',
                tone: 'bg-sky-500',
              },
              {
                icon: MessageSquare,
                title: 'Pelanggan Chat',
                body: ' "Berapa DP ruko type A?" → dijawab otomatis',
                tone: 'bg-amber-500',
              },
            ].map((c, i) => (
              <div
                key={i}
                className="rounded-2xl border bg-card p-4 shadow-lg animate-float"
                style={{ animationDelay: `${i * 0.8}s` }}
              >
                <div
                  className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${c.tone} text-white`}
                >
                  <c.icon className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {c.title}
                </p>
                <p className="mt-1 text-sm text-foreground">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

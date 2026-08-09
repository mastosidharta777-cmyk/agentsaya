'use client';

import { CreditCard, QrCode, Bot, MessageSquare } from 'lucide-react';

const STEPS = [
  {
    icon: CreditCard,
    title: 'Isi Detail Bisnis',
    body: 'Masukkan nama bisnis, knowledge base (produk, harga, FAQ), welcome message, dan kontak Anda.',
  },
  {
    icon: QrCode,
    title: 'Bayar Rp 49.000 via QRIS',
    body: 'Scan kode QRIS dengan e-wallet atau m-banking apa pun. AI agent dibuat saat checkout.',
  },
  {
    icon: Bot,
    title: 'AI Agent Aktif',
    body: 'Langganan aktif 30 hari. Link chat unik dibuat otomatis (agentku.id/chat/nama-bisnis).',
  },
  {
    icon: MessageSquare,
    title: 'Terima Link & Embed',
    body: 'Link chat + embed code dikirim ke WhatsApp & email Anda. Bagikan atau pasang di website.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 bg-muted/40 py-20">
      <div className="container">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Cara Kerja
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            dari Isi Form ke AI Aktif dalam 4 Langkah
          </h2>
        </div>

        <div className="relative grid gap-8 md:grid-cols-4">
          <div
            className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block"
            aria-hidden
          />
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative text-center">
              <div className="relative z-10 mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-card border shadow-sm">
                <s.icon className="h-6 w-6 text-primary" />
                <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </span>
              </div>
              <h3 className="font-display text-base font-bold tracking-tight">
                {s.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

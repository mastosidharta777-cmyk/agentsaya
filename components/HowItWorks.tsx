'use client';

import { Upload, MessageSquare, Phone, Bell } from 'lucide-react';

const STEPS = [
  {
    icon: Upload,
    title: 'Unggah Knowledge Base',
    body: 'AI mempelajari katalog produk, harga, dan FAQ bisnis Anda.',
  },
  {
    icon: MessageSquare,
    title: 'Jawab Pelanggan 24/7',
    body: 'AI merespons pertanyaan pengunjung web secara instan & akurat.',
  },
  {
    icon: Phone,
    title: 'Tangkap Data Lead',
    body: 'AI meminta nama & WhatsApp calon pembeli yang berminat.',
  },
  {
    icon: Bell,
    title: 'Notifikasi Instan',
    body: 'Data prospek otomatis masuk ke Dashboard & Email Anda.',
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

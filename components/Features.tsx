'use client';

import {
  Bot,
  MessageSquare,
  Wand2,
  Link2,
  Globe,
  Zap,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Wand2,
    title: 'Buat tanpa coding',
    body: 'Isi nama bisnis & knowledge base. Tidak perlu developer, tidak perlu server.',
  },
  {
    icon: Bot,
    title: 'Jawab pelanggan 24/7',
    body: 'AI menjawab pertanyaan calon pembeli berdasarkan info bisnis Anda, kapan saja.',
  },
  {
    icon: Link2,
    title: 'Link shareable',
    body: 'Setiap agent punya link unik (agentku.id/chat/nama-bisnis). Bagikan ke siapa pun.',
  },
  {
    icon: Globe,
    title: 'Embed di website',
    body: 'Pasang AI agent di website Anda dengan satu baris embed code.',
  },
  {
    icon: MessageSquare,
    title: 'Welcome message custom',
    body: 'Atur sapaan pertama yang dilihat setiap pengunjung yang membuka chat.',
  },
  {
    icon: Zap,
    title: 'Aktivasi instan',
    body: 'Bayar QRIS, agent langsung aktif 30 hari. Link dikirim ke WhatsApp & email.',
  },
];

export function Features() {
  return (
    <section id="features" className="scroll-mt-24 py-20">
      <div className="container">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Kenapa AgentKu
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            AI Agent untuk Bisnis Apa Pun
          </h2>
          <p className="mt-4 text-muted-foreground">
            Dari properti, kuliner, jasa, hingga retail — buat AI agent yang
            paham bisnis Anda dalam hitungan menit.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/20 hover:shadow-lg"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-bold tracking-tight">
                {f.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';

const FAQS = [
  {
    q: 'Apakah saya perlu coding untuk membuat AI agent?',
    a: 'Tidak. Anda hanya mengisi nama bisnis, knowledge base (deskripsi produk/harga/FAQ), dan welcome message. Sistem membuat AI agent dan link chat otomatis.',
  },
  {
    q: 'Apa itu knowledge base?',
    a: 'Knowledge base adalah informasi bisnis Anda — daftar produk, harga, kebijakan, FAQ, lokasi, jam buka, dll. AI menggunakan informasi ini untuk menjawab pertanyaan pelanggan secara akurat.',
  },
  {
    q: 'Bagaimana pelanggan mengakses AI agent saya?',
    a: 'Setiap agent punya link unik seperti agentku.id/chat/nama-bisnis. Bagikan link via WhatsApp, Instagram, atau pasang embed code di website Anda.',
  },
  {
    q: 'Berapa lama langganan berlaku?',
    a: 'Setiap pembayaran Rp 49.000 mengaktifkan langganan 30 hari. Link chat aktif selama langganan berjalan.',
  },
  {
    q: 'Bisa untuk bisnis selain properti?',
    a: 'Ya! AgentKu bekerja untuk bisnis apa pun — kuliner, jasa, retail, konsultan, klinik, dll. Selama Anda bisa mendeskripsikan bisnis di knowledge base, AI bisa menjawab.',
  },
  {
    q: 'Bagaimana AI menjawab pertanyaan di luar knowledge base?',
    a: 'AI hanya menjawab berdasarkan informasi yang Anda masukkan. Jika ditanya hal di luar knowledge base, AI akan mengarahkan pelanggan untuk menghubungi Anda langsung.',
  },
];

export function FAQ() {
  return (
    <section id="faq" className="scroll-mt-24 py-20">
      <div className="container">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            FAQ
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Pertanyaan Umum
          </h2>
        </div>

        <div className="mx-auto max-w-2xl">
          <Accordion type="single" collapsible className="space-y-3">
            {FAQS.map((f, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="rounded-xl border bg-card px-5 shadow-sm [&[data-state=open]]:border-primary/30"
              >
                <AccordionTrigger className="text-left font-display text-base font-semibold hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-10 text-center">
            <Button asChild size="lg" className="font-semibold">
              <a href="#checkout">Buat AI Agent Sekarang</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

import { Bot } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t bg-secondary text-secondary-foreground">
      <div className="container py-12">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <span className="font-display text-lg font-bold">AgentKu</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-secondary-foreground/70">
              AI Sales Agent siap pakai untuk agent & developer properti.
              Aktivasi instan, onboarding otomatis.
            </p>
          </div>

          <div>
            <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-secondary-foreground/60">
              Produk
            </h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="#features" className="hover:text-primary">Fitur</a></li>
              <li><a href="#packages" className="hover:text-primary">Paket</a></li>
              <li><a href="#how" className="hover:text-primary">Cara Kerja</a></li>
              <li><a href="#faq" className="hover:text-primary">FAQ</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-secondary-foreground/60">
              Kontak
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-secondary-foreground/70">
              <li>halo@agentku.id</li>
              <li>+62 812 0000 0000</li>
              <li>Jakarta, Indonesia</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-secondary-foreground/10 pt-6 text-xs text-secondary-foreground/60 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} AgentKu. All rights reserved.</p>
          <p>Dibuat dengan Next.js, Supabase & Tailwind CSS.</p>
        </div>
      </div>
    </footer>
  );
}

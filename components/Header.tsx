'use client';

import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { label: 'Fitur', href: '#features' },
    { label: 'Cara Kerja', href: '#how' },
    { label: 'FAQ', href: '#faq' },
  ];

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${
        scrolled
          ? 'border-b bg-background/80 backdrop-blur-md shadow-sm'
          : 'border-b border-transparent'
      }`}
    >
      <div className="container flex h-16 items-center justify-between">
        <a href="#" className="flex items-center gap-2">
          <Logo className="text-xl" />
        </a>

        <nav className="hidden items-center gap-6 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:block">
          <Button asChild size="sm" className="font-semibold">
            <a href="#checkout">Buat AI Agent</a>
          </Button>
        </div>

        <button
          className="md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="border-b bg-background md:hidden">
          <nav className="container flex flex-col py-4">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
            <Button asChild size="sm" className="mt-3 font-semibold">
              <a href="#checkout" onClick={() => setOpen(false)}>
                Buat AI Agent
              </a>
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}

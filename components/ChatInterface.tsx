'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Loader2, ArrowDown, AlertCircle, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const blocks: JSX.Element[] = [];
  let tableRows: string[][] = [];
  let inTable = false;
  let keyCounter = 0;

  const flushTable = () => {
    if (tableRows.length > 0) {
      const header = tableRows[0];
      const body = tableRows.slice(2);
      blocks.push(
        <div key={`table-${keyCounter++}`} className="my-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-slate-100">
              <tr>
                {header.map((cell, i) => (
                  <th key={i} className="px-3 py-2 text-left font-semibold text-slate-700">
                    {cell.trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-slate-700">
                      {cell.trim()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
      inTable = false;
    }
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine;
    const trimmed = line.trim();

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.slice(1, -1).split('|');
      tableRows.push(cells);
      inTable = true;
      return;
    } else if (inTable && (trimmed === '' || !trimmed.startsWith('|'))) {
      flushTable();
    }

    if (trimmed === '') {
      blocks.push(<div key={`br-${idx}`} className="h-1" />);
      return;
    }

    if (trimmed.startsWith('### ')) {
      blocks.push(<h3 key={idx} className="mt-3 mb-1 text-sm font-bold text-slate-900">{trimmed.slice(4)}</h3>);
      return;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push(<h2 key={idx} className="mt-3 mb-1 text-base font-bold text-slate-900">{trimmed.slice(3)}</h2>);
      return;
    }
    if (trimmed.startsWith('# ')) {
      blocks.push(<h1 key={idx} className="mt-3 mb-1 text-lg font-bold text-slate-900">{trimmed.slice(2)}</h1>);
      return;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push(
        <div key={idx} className="my-0.5 flex gap-2 text-slate-700">
          <span className="mt-1.5 h-1 w-1 flex-none rounded-full bg-slate-400" />
          <span dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(2)) }} />
        </div>
      );
      return;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+)\.\s(.*)$/);
      if (num) {
        blocks.push(
          <div key={idx} className="my-0.5 flex gap-2 text-slate-700">
            <span className="font-semibold text-slate-500">{num[1]}.</span>
            <span dangerouslySetInnerHTML={{ __html: inlineFormat(num[2]) }} />
          </div>
        );
        return;
      }
    }

    blocks.push(
      <p key={idx} className="my-1 text-slate-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed) }} />
    );
  });

  flushTable();

  return <div className="text-sm">{blocks}</div>;
}

function inlineFormat(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="rounded bg-slate-100 px-1 py-0.5 text-xs font-mono">$1</code>');
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatInterfaceProps {
  agentName: string;
  welcomeMessage: string;
  slug: string;
  isEmbed?: boolean;
}

export function ChatInterface({
  agentName,
  welcomeMessage,
  slug,
  isEmbed = false,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: welcomeMessage },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScroll, setShowScroll] = useState(false);
  const [trialExpired, setTrialExpired] = useState(false);
  const [trialMessage, setTrialMessage] = useState('');
  const [isTrial, setIsTrial] = useState(false);
  const [expired, setExpired] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [renewalUrl, setRenewalUrl] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  function scrollToBottom(smooth = true) {
    bottomRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    });
  }

  useEffect(() => {
    scrollToBottom(false);
  }, []);

  useEffect(() => {
    async function checkAgentStatus() {
      try {
        const res = await fetch(`/api/agent/status?slug=${encodeURIComponent(slug)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.expired) {
            setExpired(true);
            setRenewalUrl(data.renewalUrl || '/');
          }
          setDaysRemaining(data.daysRemaining ?? null);
          setIsTrial(data.isTrial || false);
        }
      } catch (err) {
        console.error('Failed to check agent status:', err);
      }
    }
    checkAgentStatus();
  }, [slug]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScroll(!nearBottom);
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const history = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, message: text, history }),
      });
      
      console.log('Chat API response status:', res.status);
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('Chat API error response:', errorData);
        
        if (errorData.expired || errorData.trialExpired) {
          setExpired(true);
          setRenewalUrl(errorData.renewalUrl || '/');
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: errorData.error || 'Langganan Anda telah berakhir. Silakan perpanjang.',
            },
          ]);
          setLoading(false);
          setTimeout(() => scrollToBottom(), 100);
          return;
        }
        
        throw new Error(errorData.error || `API error: ${res.status}`);
      }
      
      const data = await res.json();
      console.log('Chat API response data:', data);
      
      const reply: ChatMessage = {
        role: 'assistant',
        content: data.reply || 'Maaf, terjadi kesalahan. Coba lagi.',
      };
      setIsTrial(data.isTrial || false);
      setMessages((prev) => [...prev, reply]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error message:', errorMessage);
      
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Maaf, terjadi kesalahan: ${errorMessage}. Silakan coba lagi.`,
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollToBottom(), 100);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={`flex flex-col bg-muted/20 ${isEmbed ? 'h-full' : 'h-[100dvh]'}`}>
      {/* Header */}
      <header className={`flex items-center gap-3 border-b bg-card shadow-sm ${isEmbed ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <div className={`flex flex-none items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-500 text-primary-foreground ${isEmbed ? 'h-8 w-8' : 'h-10 w-10'}`}>
          <Bot className={`${isEmbed ? 'h-4 w-4' : 'h-5 w-5'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className={`truncate font-display font-bold tracking-tight ${isEmbed ? 'text-sm' : 'text-base'}`}>
            {agentName}
          </h1>
          {!isEmbed && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`inline-block h-2 w-2 rounded-full ${isTrial ? 'bg-amber-500' : 'bg-primary'} animate-pulse`} />
              {isTrial ? 'Free Trial · siap membantu' : 'Online · siap membantu'}
            </p>
          )}
        </div>
        {isTrial && !isEmbed && (
          <div className="flex-none rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            Trial
          </div>
        )}
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto ${isEmbed ? 'px-3 py-4' : 'px-4 py-6'}`}
      >
        <div className={`mx-auto space-y-4 ${isEmbed ? 'max-w-full' : 'max-w-2xl'}`}>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              } animate-fade-up`}
            >
              {msg.role === 'assistant' && !isEmbed && (
                <div className="mr-2 mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-primary to-emerald-500 text-primary-foreground">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div
                className={`${isEmbed ? 'max-w-[90%]' : 'max-w-[85%]'} rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                  msg.role === 'user'
                    ? 'rounded-br-md bg-primary text-primary-foreground whitespace-pre-wrap'
                    : 'rounded-bl-md bg-card border overflow-x-auto'
                }`}
              >
                {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start animate-fade-in">
              {!isEmbed && (
                <div className="mr-2 mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-primary to-emerald-500 text-primary-foreground">
                  <Bot className="h-4 w-4" />
                </div>
              )}
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border bg-card px-4 py-3 shadow-sm">
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Expired lock screen */}
      {expired && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
          <div className="mx-auto max-w-md px-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-foreground">
              Langganan Berakhir
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Agent Anda sudah tidak aktif. Perpanjang untuk melanjutkan menggunakan AI Assistant.
            </p>
            <Button
              className="mt-6"
              onClick={() => {
                if (renewalUrl) {
                  window.location.href = renewalUrl;
                }
              }}
            >
              Perpanjang Sekarang
            </Button>
          </div>
        </div>
      )}

      {/* Expiring soon warning banner */}
      {!expired && daysRemaining !== null && daysRemaining <= 1 && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-3">
          <div className="mx-auto flex max-w-2xl items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                {isTrial
                  ? 'Masa trial gratis akan berakhir dalam 1 hari. Segera upgrade untuk melanjutkan.'
                  : 'Langganan akan berakhir dalam 1 hari. Segera perpanjang untuk melanjutkan.'}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    if (renewalUrl) {
                      window.location.href = renewalUrl;
                    }
                  }}
                >
                  <ArrowUp className="mr-1.5 h-3 w-3" />
                  {isTrial ? 'Upgrade Sekarang' : 'Perpanjang Sekarang'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trial expiration banner */}
      {trialExpired && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-3">
          <div className="mx-auto flex max-w-2xl items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                {trialMessage}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => window.location.href = '/'}
                >
                  <ArrowUp className="mr-1.5 h-3 w-3" />
                  Upgrade Sekarang
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showScroll && (
        <button
          onClick={() => scrollToBottom()}
          className="absolute bottom-24 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border bg-card shadow-lg transition-all hover:bg-muted"
          aria-label="Scroll ke bawah"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}

      {/* Input */}
      <div className={`border-t bg-card ${isEmbed ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <form
          onSubmit={handleSend}
          className={`mx-auto flex items-end gap-2 ${isEmbed ? 'max-w-full' : 'max-w-2xl'}`}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={expired ? 'Langganan telah berakhir' : trialExpired ? 'Masa trial telah berakhir' : 'Tulis pesan…'}
            rows={1}
            className={`max-h-32 resize-none ${isEmbed ? 'min-h-[36px] text-sm' : 'min-h-[44px]'}`}
            disabled={loading || expired || trialExpired}
          />
          <Button
            type="submit"
            size="icon"
            className={`flex-none ${isEmbed ? 'h-9 w-9' : 'h-11 w-11'}`}
            disabled={loading || expired || trialExpired || !input.trim()}
          >
            {loading ? (
              <Loader2 className={`${isEmbed ? 'h-4 w-4' : 'h-5 w-5'} animate-spin`} />
            ) : (
              <Send className={`${isEmbed ? 'h-4 w-4' : 'h-5 w-5'}`} />
            )}
          </Button>
        </form>
        {!isEmbed && (
          <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-muted-foreground">
            Dibuat dengan Agent Saya · AI bisa membuat kesalahan
          </p>
        )}
      </div>
    </div>
  );
}

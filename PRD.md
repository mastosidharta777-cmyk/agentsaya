# Product Requirements Document (PRD) - Agent Saya

## 1. Overview

**Agent Saya** adalah platform SaaS RAG AI Agent builder untuk customer support & sales assistant berbasis dokumen. User bisa mengunggah price list / knowledge base (PDF/gambar/txt) lalu langsung dapat AI agent yang bisa dijawab via link shareable atau embed di website.

Target: UMKM, sales, real estate, customer support yang butuh chatbot custom tanpa coding.

## 2. Target User

- **Real estate agent** yang butuh bot untuk jawab pertanyaan buyer
- **UMKM / toko online** yang butuh FAQ bot 24/7
- **Customer support** yang butuh auto-reply berdasarkan SOP/dokumen
- **Sales tim** yang butuh lead capture dari chat

## 3. Subscription Plans

| Plan | Price | Duration | Features |
|------|-------|----------|----------|
| **Free Trial** | GRATIS | 3 hari | 1 AI Agent, Knowledge Base, Welcome Message, Link Chat, Embed Code |
| **Basic (Monthly)** | Rp 49.000 | 30 hari | Sama seperti trial + aktivasi 30 hari |
| **Yearly** | Rp 399.000 | 365 hari | Sama + hemat 32% |

**Business Rules:**
- 1 akun (email/HP) = 1 agent aktif (PAID atau TRIAL)
- User yang sudah punya agent aktif tidak bisa bikin baru, hanya renewal atau edit KB
- Email/HP yang pernah trial & sudah expired boleh bikin trial baru
- Renewal lewat `/checkout?slug=xxx&renewal=true`

## 4. Core Features

### 4.1 Agent Builder
- Form input: nama agent, welcome message, knowledge base (manual)
- Upload file: PDF, TXT, JPG, PNG, WEBP
- Extraction: `unpdf` untuk PDF digital, OCR.space untuk PDF scan/gambar
- System prompt dibangun otomatis dengan guardrail zero-hallucination

### 4.2 AI Chat Engine
- Multi-provider LLM fallback: OpenRouter → Groq → SambaNova → OpenAI
- Temperature: 0.0 (deterministic)
- Max tokens: 4000
- Lead capture otomatis saat user mention HP/nama
- Markdown table rendering untuk list harga
- Strict knowledge base (tidak mengarang)

### 4.3 Dashboard
- Login via email/HP
- Lihat list agent + status (TRIAL/PAID/EXPIRED)
- Edit knowledge base
- Copy shareable link + embed code
- Lihat leads/calon pembeli
- Lihat referral stats
- Banner countdown untuk trial

### 4.4 Trial Lifecycle (CRON)
- Vercel Cron jalan harian jam 01:00 WIB
- Email reminder 4 stage:
  - **H-2**: "Trial berakhir dalam 2 hari" (amber)
  - **H+0**: "Trial berakhir hari ini" (red)
  - **H+3**: "Diskon 50% khusus" (purple)
  - **H+7**: "Pesan terakhir" (gray)

### 4.5 Payment
- iPaymu: QRIS, Transfer Bank, E-Wallet
- Webhook → activate agent → kirim email welcome
- Yearly support (365 hari)

## 5. Tech Stack

- **Frontend**: Next.js 13 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API routes, Supabase (PostgreSQL + RLS)
- **AI/LLM**:
  - OpenRouter (primary free models)
  - Groq (openai/gpt-oss-20b, groq/compound-mini)
  - SambaNova (Llama, Qwen, DeepSeek)
  - OpenAI gpt-4o-mini (last fallback, paid)
- **Document Extraction**:
  - `unpdf` v0.10.0 (PDF digital)
  - OCR.space API (PDF scan & gambar)
- **Payment**: iPaymu
- **Email**: Resend
- **Hosting**: Vercel (with Cron Jobs)
- **Storage**: Supabase (DB only, no file storage yet)

## 6. Database Schema (Ringkas)

### agents
- `id` (uuid, PK)
- `agent_name`, `custom_agent_slug` (unique), `welcome_message`
- `knowledge_base`, `system_prompt`
- `payment_status` (PENDING/PAID/TRIAL/EXPIRED)
- `plan_tier` (trial/basic/yearly)
- `period_start`, `period_end`, `trial_ends_at`
- `owner_name`, `owner_email`, `owner_phone`
- `referral_code` (unique), `referred_by` (FK), `referral_bonus_days`
- `last_trial_reminder_sent`, `last_trial_reminder_stage`

### transactions
- `id`, `merchant_ref` (unique), `gateway_reference`
- `package_id`, `amount`, `status` (UNPAID/PAID/EXPIRED/FAILED)
- `customer_name`, `customer_email`, `customer_phone`
- `agent_id` (FK), `paid_at`

### leads
- `id`, `agent_id` (FK)
- `customer_name`, `customer_phone`, `message_summary`
- `source` (default: 'chat')

### packages (legacy catalog)
- `id`, `tier`, `name`, `price_monthly`, `features[]`

## 7. API Endpoints

| Endpoint | Method | Fungsi |
|---|---|---|
| `/api/checkout` | POST | Bikin agent + transaction (trial/paid/renewal) |
| `/api/webhooks/ipaymu` | POST | Payment callback → activate agent |
| `/api/chat` | POST | Public chat endpoint untuk visitor |
| `/api/agent/status` | GET | Cek status agent (active/expired) |
| `/api/extract-pdf` | POST | Extract teks PDF (unpdf + OCR fallback) |
| `/api/extract-image` | POST | OCR gambar (OCR.space) |
| `/api/dashboard/auth` | POST | Login dashboard via email/HP |
| `/api/dashboard/leads` | POST | Fetch leads milik user |
| `/api/dashboard/update-agent` | POST | Update KB/welcome message |
| `/api/cron/expire-trials` | GET | Run daily (Vercel Cron) — expire + send reminders |
| `/api/transaction/status` | GET | Poll status pembayaran iPaymu |

## 8. Pages

| Page | Fungsi |
|---|---|
| `/` | Landing page (hero, features, pricing, FAQ) |
| `/checkout/[slug]?renewal=true` | Checkout / renewal |
| `/chat/[slug]` | Public AI agent chat (embed-ready) |
| `/dashboard` | Owner dashboard (login + manage) |
| `/success` | Post-payment success page |

## 9. Non-Goals (Belum Didukung)

- Multi-agent dalam 1 akun
- File upload ke storage (saat ini PDF hanya diproses, tidak disimpan)
- Custom domain untuk chat page
- Voice/audio chat
- Multi-language UI (saat ini Indonesia only)
- Team collaboration (multi-user dalam 1 agent)

## 10. Future Roadmap

- **Q4 2026**: Multi-agent, file storage di Supabase, custom domain
- **Q1 2027**: Voice chat (Whisper), analytics dashboard, WhatsApp Business API
- **Q2 2027**: White-label, team seats, agency plan

## 11. Environment Variables

```env
# LLM Providers (minimal 1 harus set)
OPENAI_API_KEY=sk-...
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
SAMBANOVA_API_KEY=...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# OCR (opsional, untuk PDF scan)
OCR_SPACE_API_KEY=...

# Payment (iPaymu)
IPAYMU_API_KEY=...
IPAYMU_SECRET=...

# Email (Resend)
RESEND_API_KEY=...
RESEND_FROM=...

# Cron Security (opsional)
CRON_SECRET=...
```

## 12. Success Metrics

- **Trial → Paid conversion rate**: target 15%
- **Trial → Trial ulang (engagement)**: target 30% return in 30 days
- **Average chat messages per agent per day**: target 10+
- **Dashboard MAU**: target 50% of registered users

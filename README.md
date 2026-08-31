# Agent Saya

Platform SaaS RAG Agent untuk Customer Support & Sales Assistant berbasis dokumen (PDF/Gambar Price List).

## Tech Stack

- **Framework**: Next.js (App Router) & TypeScript
- **Backend & Database**: Supabase (Database, Auth, Edge Functions)
- **AI & LLM Gateway**: Multi-Provider Fallback
  - **OpenRouter**: `google/gemini-2.0-flash-lite-preview-02-05:free`, `qwen/qwen-2.5-72b-instruct:free`, `meta-llama/llama-3.3-70b-instruct:free`
  - **Groq**: `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`
  - **SambaNova**: `Meta-Llama-3.3-70B-Instruct`, `Meta-Llama-3.1-8B-Instruct`
- **Document Extraction**: unpdf (Digital PDF) & OCR.space API (Scan/Foto PDF Fallback)
- **Payment Gateway**: iPaymu (QRIS/Transfer/E-Wallet)

## Features

- Automated Price List & PDF Parsing to Markdown Table.
- High-Precision RAG with Strict System Prompts (Zero-Hallucination).
- Multimodal OCR & Vision AI Support.
- Fallback Contact Card Triggering.
- Temperature locked to `0.0` for deterministic output.
- Multi-provider LLM fallback with automatic retry.
- Flexible Subscription Plans: Free Trial, Monthly, and Yearly with instant activation.

## Subscription Plans

| Plan | Price | Duration | Features |
|------|-------|----------|----------|
| **Free Trial** | GRATIS | 3 Hari | 1 AI Agent, Knowledge Base, Welcome Message, Link Chat, Embed Code |
| **Basic (Monthly)** | Rp 49.000 | 30 Hari | 1 AI Agent, Knowledge Base, Welcome Message, Link Chat, Embed Code |
| **Yearly** | Rp 399.000 | 365 Hari | 1 AI Agent, Knowledge Base, Welcome Message, Link Chat, Embed Code, Hemat 32% |

## Environment Variables

Buat file `.env.local` di root project dan isi dengan:

```env
# LLM Providers
OPENROUTER_API_KEY=...
GROQ_API_KEY=...
SAMBANOVA_API_KEY=...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# OCR (Opsional untuk PDF Scan)
OCR_SPACE_API_KEY=...

# Payment Gateway (iPaymu)
IPAYMU_API_KEY=...
IPAYMU_SECRET=...
```

## Setup & Installation

```bash
git clone <repo-url>
cd AgentKu-main/AgentKu-main
npm install
npm run dev
```

## How It Works

1. **Agent Builder**: User mengisi form nama agent, knowledge base, dan pesan welcome.
2. **Plan Selection**: User memilih paket langganan (Trial, Bulanan, atau Tahunan).
3. **Checkout**: Pembayaran via QRIS/Transfer/E-Wallet melalui iPaymu.
4. **PDF Upload**: User mengunggah price list (PDF/Gambar).
5. **Extraction**:
   - PDF digital diekstrak teksnya via `unpdf`.
   - PDF scan/foto menggunakan fallback OCR.space.
   - Hasil teks disusun menjadi Clean Markdown Table via OpenRouter Vision/LLM.
6. **RAG Chat**: User mengobrol dengan agent yang hanya menjawab berdasarkan Knowledge Base dengan guardrail zero-hallucination.

## Default Welcome Message

Template default welcome message:
```
Halo! Saya Asisten Virtual {agentName}. Ada yang bisa saya bantu hari ini?
```

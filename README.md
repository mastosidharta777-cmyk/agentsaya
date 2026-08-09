# AgentKu

Platform SaaS RAG Agent untuk Customer Support & Sales Assistant berbasis dokumen (PDF/Gambar Price List).

## Tech Stack

- **Framework**: Next.js (App Router) & TypeScript
- **Backend & Database**: Supabase (Database, Auth, Edge Functions)
- **AI & LLM Gateway**: OpenRouter (`openai/gpt-4o-mini` & model Gemini Vision)
- **Document Extraction**: unpdf (Digital PDF) & OCR.space API (Scan/Foto PDF Fallback)

## Features

- Automated Price List & PDF Parsing to Markdown Table.
- High-Precision RAG with Strict System Prompts (Zero-Hallucination).
- Multimodal OCR & Vision AI Support.
- Fallback Contact Card Triggering.

## Environment Variables

Buat file `.env.local` di root project dan isi dengan:

```env
OPENROUTER_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
OCR_SPACE_API_KEY=... # Opsional untuk PDF Scan
```

## Setup & Installation

```bash
git clone <repo-url>
cd AgentKu-main/AgentKu-main
npm install
npm run dev
```

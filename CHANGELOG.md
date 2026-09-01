# Changelog

Catatan perubahan detail untuk Agent Saya.

## [Unreleased] - 2026-09-01

### Added
- **1 Account = 1 Active Agent**: Deteksi duplikat di checkout berdasarkan `owner_email` & `owner_phone`. User yang sudah punya agent aktif (PAID/TRIAL) tidak bisa bikin agent baru, hanya bisa renewal atau edit KB.
- **Trial Lifecycle Flow**: CRON endpoint `/api/cron/expire-trials` jalan harian jam 01:00 WIB. Kirim email reminder di 4 stage (H-2, H+0, H+3, H+7).
- **Dashboard Trial Banner**: Countdown banner otomatis untuk agent TRIAL (hijau/amber/merah) dengan tombol upgrade.
- **Dedicated Checkout Page** (`/checkout?slug=xxx&renewal=true`): Halaman khusus renewal dengan pilihan paket Bulanan/Tahunan.
- **Markdown Renderer di Chat**: Tabel harga, bullet list, bold, heading dirender sebagai HTML rapi (bukan teks mentah).
- **OpenAI Fallback**: Tambahan provider `gpt-4o-mini` di urutan fallback ke-4.
- **Email Templates** untuk trial reminder (`buildTrialReminderEmail` di `lib/email.ts`).
- **New DB Columns**: `last_trial_reminder_sent`, `last_trial_reminder_stage` di tabel `agents`.
- **Vercel Cron** config di `vercel.json` (`/api/cron/expire-trials`, schedule `0 1 * * *`).

### Changed
- **`max_tokens`** dinaikkan dari 2000 → 4000 di semua LLM providers supaya list harga panjang tidak terpotong.
- **OCR.space language**: `ind` → `eng` (fix E201 invalid language).
- **`unpdf`**: downgrade 1.8.0 → 0.10.0 (fix Vercel serverless crash `Super constructor null`).
- **Trial flow skip PDF processing**: Backend checkout tidak lagi memproses PDF untuk trial plan (fix FUNCTION_INVOCATION_TIMEOUT 5 menit).
- **Trial tidak lagi lewat iPaymu**: Langsung insert agent + transaction di Supabase (instan).

### Fixed
- **Trial tidak pernah gagal** di Vercel: timeout 5 menit sebelumnya karena PDF processing.
- **PDF extraction tidak crash** di Vercel serverless.
- **List harga mudah dibaca** di mobile dengan scrollable table.
- **AI tidak wrap tabel dengan backtick** (Markdown Table langsung di-render sebagai HTML).

## [Earlier] - 2026-08-29

### Added
- Paket Tahunan (Rp 399.000 / 365 hari) dengan badge "Hemat 32%".
- Lead capture (nama + WA) via chat AI, simpan ke tabel `leads`.
- Dashboard "Daftar Lead / Calon Pembeli".
- Dashboard button di Header & success page.
- Image OCR endpoint (`/api/extract-image`) untuk JPG/PNG/WEBP.
- Free trial 3 hari dengan `payment_status: 'TRIAL'`.

## [Initial] - 2026-08-11

### Added
- Multi-provider LLM (OpenRouter, Groq, SambaNova) dengan automatic fallback.
- PDF/Image extraction (unpdf + OCR.space).
- Payment gateway iPaymu (QRIS/Transfer/E-Wallet).
- 3 paket subscription (Trial, Bulanan Rp 49.000, Tahunan Rp 399.000).
- Referral system dengan bonus 7 hari.
- Dashboard untuk owner agent.
- Supabase database schema (agents, transactions, leads, packages).

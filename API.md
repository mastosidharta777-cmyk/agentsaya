# API Documentation - Agent Saya

Dokumentasi lengkap untuk semua API endpoints.

**Base URL**: `https://www.agentsaya.site` (production) atau `http://localhost:3000` (development)

---

## 1. Checkout & Payment

### POST `/api/checkout`

Bikin agent baru atau renewal agent existing. Support 3 plan: trial (gratis), monthly, yearly.

**Request** (multipart/form-data):
| Field | Type | Required | Description |
|---|---|---|---|
| `agentName` | string | ✅ | Nama agent / bisnis |
| `knowledgeBase` | string | ✅ | Knowledge base manual (text) |
| `welcomeMessage` | string | ❌ | Welcome message (default generated) |
| `name` | string | ✅ | Owner nama lengkap |
| `email` | string | ✅ | Owner email (untuk login & notifikasi) |
| `phone` | string | ✅ | Owner WhatsApp (untuk login & notifikasi) |
| `planType` | string | ✅ | `trial` \| `monthly` \| `yearly` |
| `slug` | string | ❌ | Slug (required jika `renewal=true`) |
| `renewal` | string | ❌ | `true` untuk perpanjang agent |
| `pdfFile` | file | ❌ | PDF/gambar untuk ekstrak KB otomatis |
| `referralCode` | string | ❌ | Referral code dari agent lain |

**Responses**:

✅ `200 OK` (paid plan, baru):
```json
{
  "success": true,
  "agentId": "uuid",
  "transactionId": "REF-xxx",
  "redirectUrl": "https://ipaymu-url",
  "sandbox": false
}
```

✅ `200 OK` (trial):
```json
{
  "success": true,
  "agentId": "uuid",
  "redirectUrl": "/success?ref=trial&slug=city-hub",
  "sandbox": true
}
```

❌ `409 Conflict` (duplicate active agent):
```json
{
  "error": "Anda sudah memiliki agent aktif (City Hub Commercial). Setiap akun hanya untuk 1 agent...",
  "existingAgentSlug": "city-hub-commercial-yjea",
  "dashboardUrl": "https://www.agentsaya.site/dashboard",
  "upgradeUrl": "https://www.agentsaya.site/checkout?slug=city-hub-commercial-yjea&renewal=true"
}
```

❌ `500` (database error):
```json
{ "error": "Gagal membuat agent: <detail>" }
```

---

### POST `/api/webhooks/ipaymu`

Callback dari iPaymu saat payment success/failed. Dipanggil otomatis.

**Request** (form-urlencoded atau JSON):
| Field | Type | Description |
|---|---|---|
| `merchant_ref` | string | ID transaksi kita |
| `reference` | string | ID transaksi iPaymu |
| `status` | string | `berhasil` / `gagal` / `expire` |

**Response**: `200 OK` plain text.

---

### GET `/api/transaction/status?merchantRef=REF-xxx`

Poll status pembayaran (untuk QRIS).

**Query**: `merchantRef` (required)

**Response**:
```json
{
  "status": "PAID",
  "amount": 49000,
  "agent_name": "...",
  "custom_agent_slug": "...",
  "owner_name": "...",
  "owner_email": "...",
  "owner_phone": "..."
}
```

---

## 2. Chat

### POST `/api/chat`

Public chat endpoint. Dipanggil dari `/chat/[slug]`.

**Request** (JSON):
```json
{
  "slug": "city-hub-commercial-yjea",
  "message": "halo, mau cek harga",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Response** `200 OK`:
```json
{
  "reply": "Berikut rincian lengkap...",
  "sandbox": false,
  "agentName": "City Hub Commercial",
  "isTrial": false
}
```

❌ `403` (trial/paid expired):
```json
{
  "error": "Masa trial gratis Anda telah berakhir.",
  "expired": true,
  "trialExpired": true,
  "renewalUrl": "https://www.agentsaya.site/checkout?slug=city-hub&renewal=true"
}
```

❌ `404` (agent not found):
```json
{ "error": "Agent tidak ditemukan..." }
```

**Side effect**: jika user message mengandung nomor HP (regex `(08|+62|62)\d{8,11}`), otomatis save ke tabel `leads`.

---

### GET `/api/agent/status?slug=xxx`

Cek status agent (untuk badge di UI).

**Query**: `slug` (required)

**Response**:
```json
{
  "active": true,
  "isTrial": false,
  "expired": false,
  "renewalUrl": "https://www.agentsaya.site/checkout?slug=city-hub&renewal=true"
}
```

---

## 3. Document Extraction

### POST `/api/extract-pdf`

Extract teks dari PDF (unpdf + OCR fallback).

**Request** (multipart/form-data):
| Field | Type | Description |
|---|---|---|
| `file` | file (PDF) | Maks 10MB |

**Response** `200 OK`:
```json
{ "text": "Isi dokumen dalam plain text..." }
```

❌ `422` (extraction gagal):
```json
{ "error": "PDF berbasis gambar ini ukurannya melebihi batas OCR gratis (maksimal 1 MB)..." }
```

---

### POST `/api/extract-image`

OCR gambar (JPG/PNG/WEBP) via OCR.space.

**Request** (multipart/form-data):
| Field | Type | Description |
|---|---|---|
| `file` | file (image) | JPG/PNG/WEBP |

**Response** `200 OK`:
```json
{ "text": "Hasil OCR..." }
```

---

## 4. Dashboard

### POST `/api/dashboard/auth`

Login dashboard via email atau WhatsApp.

**Request** (JSON):
```json
{ "contact": "budi@email.com atau 08123456789" }
```

**Response** `200 OK`:
```json
{
  "agents": [
    {
      "id": "uuid",
      "agent_name": "City Hub Commercial",
      "custom_agent_slug": "city-hub-commercial-yjea",
      "payment_status": "TRIAL",
      "period_end": null,
      "trial_ends_at": "2026-09-03T...",
      "knowledge_base": "...",
      "referral_code": "ABC123XY",
      "referral_bonus_days": 0,
      "created_at": "..."
    }
  ]
}
```

❌ `404` (no agents):
```json
{ "error": "Tidak ada agent untuk kontak ini" }
```

---

### POST `/api/dashboard/leads`

Fetch leads milik agent-agent user.

**Request** (JSON):
```json
{ "contact": "budi@email.com" }
```

**Response** `200 OK`:
```json
{
  "leads": [
    {
      "id": "uuid",
      "agent_id": "uuid",
      "customer_name": "Budi",
      "customer_phone": "081234567890",
      "message_summary": "Mau order 2 unit Graha 8",
      "source": "chat",
      "created_at": "2026-09-01T..."
    }
  ]
}
```

---

### POST `/api/dashboard/update-agent`

Update knowledge base / welcome message.

**Request** (JSON):
```json
{
  "contact": "budi@email.com",
  "agentId": "uuid",
  "knowledge_base": "...",
  "welcome_message": "..."
}
```

**Response** `200 OK`:
```json
{ "success": true }
```

---

## 5. Cron (Vercel)

### GET `/api/cron/expire-trials`

Jalan harian jam 01:00 WIB. Expire trial yang sudah lewat & kirim email reminder 4 stage.

**Headers**: `Authorization: Bearer <CRON_SECRET>` (jika di-set)

**Response** `200 OK`:
```json
{
  "success": true,
  "timestamp": "2026-09-01T...",
  "stats": {
    "expired": 1,
    "remindersSent": { "h-2": 2, "h0": 0, "h3": 0, "h7": 0 },
    "errors": 0
  }
}
```

---

## 6. Rate Limits & Limits

| Endpoint | Limit |
|---|---|
| `/api/chat` | `message.length ≤ 1000` chars |
| `/api/extract-pdf` | File ≤ 10MB, OCR fallback ≤ 1MB |
| `/api/extract-image` | File image only |
| `/api/checkout` | Tidak ada rate limit (per user) |

---

## 7. Error Codes

| Status | Meaning |
|---|---|
| `200` | OK |
| `400` | Bad request (missing field, invalid input) |
| `403` | Agent expired / pending payment |
| `404` | Agent not found |
| `409` | Duplicate active agent (1 akun = 1 agent) |
| `422` | Document extraction failed |
| `500` | Internal server error / database error |
| `504` | Function timeout (Vercel, max 5 min) |

---

## 8. Authentication

Tidak ada auth token tradisional. Sistem pakai:
- **Public endpoints** (`/api/chat`, `/api/agent/status`): slug-based
- **Dashboard endpoints** (`/api/dashboard/*`): require `contact` (email/HP) di body
- **Cron endpoint**: `Bearer <CRON_SECRET>` di header
- **Webhook endpoint**: iPaymu signature (TODO: implement verification)

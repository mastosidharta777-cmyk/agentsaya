import { NextResponse } from 'next/server';
// Retired. Unverified receipts, fake payments and legacy gateway callbacks must
// never activate a real AgentSaya subscription.
export async function POST() {
  return NextResponse.json(
    { error: 'Metode pembayaran lama sudah dinonaktifkan. Gunakan checkout Mayar.' },
    { status: 410 }
  );
}

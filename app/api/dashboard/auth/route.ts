import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body as { email?: string };

    if (!email || !EMAIL_REGEX.test(String(email).trim())) {
      return NextResponse.json(
        { error: 'Email valid diperlukan' },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const { count, error: lookupError } = await supabaseAdmin
      .from('agents')
      .select('id', { count: 'exact', head: true })
      .eq('owner_email', normalizedEmail);

    if (lookupError) {
      console.error('[DASHBOARD AUTH] agents lookup error:', lookupError);
      return NextResponse.json(
        { error: 'Gagal memverifikasi email' },
        { status: 500 }
      );
    }

    if (!count || count === 0) {
      return NextResponse.json(
        { error: 'Tidak ada agent yang terdaftar untuk email ini' },
        { status: 404 }
      );
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      `${req.nextUrl.protocol}//${req.nextUrl.host}`;

    const { error: otpError } = await supabaseAdmin.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: `${appUrl}/api/auth/callback` },
    });

    if (otpError) {
      console.error('[DASHBOARD AUTH] signInWithOtp error:', otpError);
      return NextResponse.json(
        { error: 'Gagal mengirim magic link' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Magic link telah dikirim ke email Anda',
    });
  } catch (err: unknown) {
    console.error('[DASHBOARD AUTH] server error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/dashboard-session';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_MAX_AGE,
};

export async function POST(req: NextRequest) {
  let body: { access_token?: string; refresh_token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const accessToken = body.access_token;
  const refreshToken = body.refresh_token || '';

  if (!accessToken) {
    return NextResponse.json({ error: 'access_token is required' }, { status: 400 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !user?.email) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const email = String(user.email).trim().toLowerCase();

  const { count, error: ownershipError } = await supabaseAdmin
    .from('agents')
    .select('id', { count: 'exact', head: true })
    .eq('owner_email', email);

  if (ownershipError) {
    console.error('[AUTH TOKEN] ownership lookup error:', ownershipError);
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }

  if (!count || count === 0) {
    return NextResponse.json(
      { error: 'Tidak ada agent yang terdaftar untuk email ini' },
      { status: 403 }
    );
  }

  const res = NextResponse.json({ authenticated: true, email });
  res.cookies.set(
    SESSION_COOKIE,
    JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
    COOKIE_OPTIONS
  );
  return res;
}

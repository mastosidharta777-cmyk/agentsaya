import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  readSessionCookie,
} from '@/lib/dashboard-session';
import type { NextRequest } from 'next/server';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_MAX_AGE,
};

export async function GET(req: NextRequest) {
  const stored = readSessionCookie(req);
  if (!stored) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(stored.access_token);

  if (!userError && user?.email) {
    return NextResponse.json({
      authenticated: true,
      email: String(user.email).trim().toLowerCase(),
    });
  }

  const {
    data: { session: refreshed, user: refreshedUser },
    error: refreshError,
  } = await supabase.auth.refreshSession({
    refresh_token: stored.refresh_token,
  });

  if (!refreshError && refreshed?.access_token && refreshedUser?.email) {
    const res = NextResponse.json({
      authenticated: true,
      email: String(refreshedUser.email).trim().toLowerCase(),
    });
    res.cookies.set(
      SESSION_COOKIE,
      JSON.stringify({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
      }),
      COOKIE_OPTIONS
    );
    return res;
  }

  console.warn('[AUTH SESSION] token invalid, requesting re-auth', refreshError);
  const res = NextResponse.json({ authenticated: false }, { status: 401 });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

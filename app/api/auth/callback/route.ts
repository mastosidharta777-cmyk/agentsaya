import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/dashboard-session';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  const redirectTo = (path: string) => NextResponse.redirect(`${appUrl}${path}`);

  if (!code) {
    return redirectTo('/dashboard?error=missing_code');
  }

  const {
    data: { session, user },
    error,
  } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !session?.access_token || !user?.email) {
    console.error('[AUTH CALLBACK] exchangeCodeForSession error:', error);
    return redirectTo('/dashboard?error=auth_failed');
  }

  const email = String(user.email).trim().toLowerCase();

  const { count, error: ownershipError } = await supabaseAdmin
    .from('agents')
    .select('id', { count: 'exact', head: true })
    .eq('owner_email', email);

  if (ownershipError) {
    console.error('[AUTH CALLBACK] ownership lookup error:', ownershipError);
    return redirectTo('/dashboard?error=auth_failed');
  }

  if (!count || count === 0) {
    return redirectTo('/dashboard?error=not_owner');
  }

  const res = redirectTo('/dashboard');
  res.cookies.set(
    SESSION_COOKIE,
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    }
  );
  return res;
}

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { SESSION_COOKIE, readSessionCookie } from '@/lib/dashboard-session';
import type { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const stored = readSessionCookie(req);

  if (stored) {
    try {
      await supabaseAdmin.auth.admin.signOut(stored.access_token, 'global');
    } catch (err) {
      console.error('[AUTH LOGOUT] signOut error:', err);
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

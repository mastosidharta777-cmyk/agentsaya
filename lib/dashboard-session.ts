import { supabaseAdmin } from '@/lib/supabase';
import type { NextRequest } from 'next/server';

export const SESSION_COOKIE = 'ds_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

interface StoredSession {
  access_token: string;
  refresh_token: string;
}

export interface SessionUser {
  email: string;
}

export function readSessionCookie(
  req: NextRequest
): StoredSession | null {
  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.access_token === 'string' &&
      typeof parsed.refresh_token === 'string'
    ) {
      return {
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
      };
    }
  } catch {
    /* malformed cookie */
  }
  return null;
}

export async function getSessionUser(
  req: NextRequest
): Promise<SessionUser | null> {
  const stored = readSessionCookie(req);
  if (!stored) return null;

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(stored.access_token);

  if (error || !user?.email) return null;

  return {
    email: String(user.email).trim().toLowerCase(),
  };
}

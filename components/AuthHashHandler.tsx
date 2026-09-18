'use client';

import { useEffect } from 'react';

const MAGIC_LINK_TYPES = new Set(['magiclink', 'signup', 'invite', 'recovery']);

export function AuthHashHandler() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.hash) return;

    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;

    const params = new URLSearchParams(hash);
    const type = params.get('type');
    const accessToken = params.get('access_token');

    if (!type || !accessToken || !MAGIC_LINK_TYPES.has(type)) return;

    const refreshToken = params.get('refresh_token') || '';

    // Strip the token from the URL immediately (defensive — no secrets in history)
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search
    );

    fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
      redirect: 'follow',
    })
      .then((res) => res.json().catch(() => ({})))
      .then(() => {
        // Full navigation clears history state + ensures the HttpOnly cookie is sent
        window.location.href = '/dashboard';
      })
      .catch(() => {
        window.location.href = '/dashboard';
      });
  }, []);

  return null;
}

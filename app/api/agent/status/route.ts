export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get('slug');
    if (!slug) {
      return NextResponse.json(
        { error: 'Slug agent wajib diisi.' },
        { status: 400 }
      );
    }

    const { data: agent, error } = await supabaseAdmin
      .from('agents')
      .select('agent_name, payment_status, period_end, trial_ends_at, plan_tier, custom_agent_slug')
      .eq('custom_agent_slug', slug)
      .maybeSingle();

    if (error || !agent) {
      return NextResponse.json(
        { error: 'Agent tidak ditemukan.' },
        { status: 404 }
      );
    }

    const isTrial = agent.payment_status === 'TRIAL';
    const now = new Date();

    let expired = false;
    let expiresAt: string | null = null;
    let daysRemaining: number | null = null;

    if (isTrial) {
      expiresAt = agent.trial_ends_at;
      if (expiresAt) {
        const end = new Date(expiresAt);
        expired = end < now;
        daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      }
    } else if (agent.payment_status === 'PAID') {
      expiresAt = agent.period_end;
      if (expiresAt) {
        const end = new Date(expiresAt);
        expired = end < now;
        daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.get('host') || 'localhost:3000'}`;
    const renewalUrl = `${baseUrl}/checkout?slug=${agent.custom_agent_slug}&renewal=true`;

    return NextResponse.json({
      expired,
      expiresAt,
      daysRemaining,
      isTrial,
      paymentStatus: agent.payment_status,
      agentName: agent.agent_name,
      renewalUrl,
    });
  } catch (err: unknown) {
    console.error('[AGENT STATUS] Error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

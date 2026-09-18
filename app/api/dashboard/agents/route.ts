import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser } from '@/lib/dashboard-session';

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: agents, error } = await supabaseAdmin
    .from('agents')
    .select(
      'id, agent_name, custom_agent_slug, payment_status, period_end, trial_ends_at, knowledge_base, welcome_message, referral_code, referral_bonus_days, created_at'
    )
    .eq('owner_email', user.email)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[DASHBOARD AGENTS] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }

  const normalized = (agents || []).map((a) => ({
    ...a,
    total_referred: 0,
  }));

  const sorted = normalized.sort((a, b) => {
    const aActive =
      a.payment_status === 'PAID' &&
      (!a.period_end || new Date(a.period_end) > new Date());
    const bActive =
      b.payment_status === 'PAID' &&
      (!b.period_end || new Date(b.period_end) > new Date());
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return NextResponse.json({ agents: sorted });
}

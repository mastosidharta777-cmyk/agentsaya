import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.CRON_SECRET || '';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!ADMIN_SECRET || auth !== `Bearer ${ADMIN_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: agents, error } = await supabaseAdmin
      .from('agents')
      .select('id, agent_name, custom_agent_slug, payment_status, plan_tier, period_end, trial_ends_at, owner_name, owner_email, owner_phone, amount, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: transactions } = await supabaseAdmin
      .from('transactions')
      .select('id, amount, status, payment_method, customer_email, customer_name, created_at, paid_at')
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: leads } = await supabaseAdmin
      .from('leads')
      .select('id, customer_name, customer_phone, message_summary, source, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    const totalRevenue = (transactions || [])
      .filter(t => t.status === 'PAID' && t.payment_method !== 'free_trial')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    const totalPaidAgents = (agents || []).filter(a => a.payment_status === 'PAID').length;
    const totalTrialAgents = (agents || []).filter(a => a.payment_status === 'TRIAL').length;
    const totalExpiredAgents = (agents || []).filter(a => a.payment_status === 'EXPIRED').length;
    const totalLeads = (leads || []).length;

    return NextResponse.json({
      stats: {
        totalAgents: agents?.length || 0,
        totalPaidAgents,
        totalTrialAgents,
        totalExpiredAgents,
        totalLeads,
        totalRevenue,
      },
      agents: agents || [],
      transactions: transactions || [],
      leads: leads || [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!ADMIN_SECRET || auth !== `Bearer ${ADMIN_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { agentId, action } = await req.json();

    if (!agentId) {
      return NextResponse.json({ error: 'agentId required' }, { status: 400 });
    }

    if (action === 'delete') {
      await supabaseAdmin.from('leads').delete().eq('agent_id', agentId);
      const { error } = await supabaseAdmin.from('agents').delete().eq('id', agentId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, action: 'deleted', agentId });
    }

    if (action === 'reset_trial') {
      const newTrialEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabaseAdmin
        .from('agents')
        .update({
          payment_status: 'TRIAL',
          trial_ends_at: newTrialEndsAt,
        })
        .eq('id', agentId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, action: 'reset_trial', agentId, newTrialEndsAt });
    }

    if (action === 'activate_paid') {
      const newPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabaseAdmin
        .from('agents')
        .update({
          payment_status: 'PAID',
          plan_tier: 'basic',
          period_end: newPeriodEnd,
        })
        .eq('id', agentId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, action: 'activated', agentId, newPeriodEnd });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

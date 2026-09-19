import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser } from '@/lib/dashboard-session';

const LEADS_COLUMNS =
  'id, agent_id, customer_name, customer_phone, message_summary, source, created_at';

const isDataUnavailableError = (err: { code?: string; message?: string }): boolean => {
  const code = err?.code;
  const message = err?.message || '';
  const notFoundCodes = ['42P01', '42703', 'PGRST106', 'PGRST116'];
  return (
    notFoundCodes.includes(code || '') ||
    /does not exist|not found|no rows|undefined table|undefined column/i.test(message)
  );
};

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: agents, error: agentsError } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('owner_email', user.email);

  if (agentsError) {
    console.error('[DASHBOARD LEADS] agents lookup error:', agentsError);
    return NextResponse.json(
      { error: 'Failed to lookup agents' },
      { status: 500 }
    );
  }

  if (!agents || agents.length === 0) {
    return NextResponse.json({ leads: [] });
  }

  const agentIds = agents.map((a) => a.id);

  const { data: leads, error: leadsError } = await supabaseAdmin
    .from('leads')
    .select(LEADS_COLUMNS)
    .in('agent_id', agentIds)
    .order('created_at', { ascending: false })
    .limit(100);

  if (leadsError) {
    console.error('[DASHBOARD LEADS] leads lookup error:', leadsError);

    if (isDataUnavailableError(leadsError)) {
      return NextResponse.json({ leads: [] });
    }

    return NextResponse.json(
      { error: 'Failed to fetch leads' },
      { status: 500 }
    );
  }

  return NextResponse.json({ leads: leads || [] });
}

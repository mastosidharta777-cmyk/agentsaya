import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contact } = body as { contact?: string };

    if (!contact) {
      return NextResponse.json(
        { error: 'Contact (email or phone) is required' },
        { status: 400 }
      );
    }

    const isEmail = contact.includes('@');

    const { data: agents, error: agentsError } = await supabaseAdmin
      .from('agents')
      .select('id')
      .or(isEmail ? `owner_email.eq.${contact}` : `owner_phone.eq.${contact}`);

    if (agentsError) {
      return NextResponse.json(
        { error: 'Failed to lookup agents' },
        { status: 500 }
      );
    }

    if (!agents || agents.length === 0) {
      return NextResponse.json({ leads: [] });
    }

    const agentIds = agents.map(a => a.id);

    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('leads')
      .select('id, agent_id, customer_name, customer_phone, message_summary, source, created_at')
      .in('agent_id', agentIds)
      .order('created_at', { ascending: false })
      .limit(100);

    if (leadsError) {
      return NextResponse.json(
        { error: 'Failed to fetch leads' },
        { status: 500 }
      );
    }

    return NextResponse.json({ leads: leads || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

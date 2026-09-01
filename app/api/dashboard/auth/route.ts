import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/dashboard/auth
 * Simple authentication for dashboard access.
 * Users can authenticate by providing their registered WhatsApp number or email.
 */
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

    // Check if contact matches email or phone pattern
    const isEmail = contact.includes('@');
    const isPhone = !isEmail;

    // Query agents by email or phone
    const { data: agents, error } = await supabaseAdmin
      .from('agents')
      .select('*')
      .or(isEmail ? `owner_email.eq.${contact}` : `owner_phone.eq.${contact}`);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to lookup agents' },
        { status: 500 }
      );
    }

    if (!agents || agents.length === 0) {
      return NextResponse.json(
        { error: 'No agents found for this contact' },
        { status: 404 }
      );
    }

    const sortedAgents = agents
      .map((a) => ({
        ...a,
        total_referred: 0,
      }))
      .sort((a, b) => {
        const aActive = a.payment_status === 'PAID' && (!a.period_end || new Date(a.period_end) > new Date());
        const bActive = b.payment_status === 'PAID' && (!b.period_end || new Date(b.period_end) > new Date());
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

    return NextResponse.json({
      success: true,
      agents: sortedAgents,
      contact,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

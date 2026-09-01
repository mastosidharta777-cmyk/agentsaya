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

    // Calculate referral stats for each agent
    const agentIds = agents.map(a => a.id);
    const { data: referrals, error: refError } = await supabaseAdmin
      .from('agents')
      .select('referred_by')
      .in('referred_by', agentIds)
      .eq('payment_status', 'PAID');

    if (!refError && referrals) {
      // Count referrals per agent
      const referralCounts = agentIds.reduce((acc, id) => {
        acc[id] = referrals.filter(r => r.referred_by === id).length;
        return acc;
      }, {} as Record<string, number>);

      // Add referral counts to agents
      agents.forEach(agent => {
        (agent as any).total_referred = referralCounts[agent.id] || 0;
      });
    }

    return NextResponse.json({
      success: true,
      agents,
      contact,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

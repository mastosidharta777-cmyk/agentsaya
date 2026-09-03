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

    const normalizedContact = String(contact).trim();
    const isEmail = normalizedContact.includes('@');

    console.log('[DASHBOARD AUTH] normalizedContact:', normalizedContact, 'isEmail:', isEmail);

    let agents: any[] = [];
    let error: any = null;

    if (isEmail) {
      const result = await supabaseAdmin
        .from('agents')
        .select('*')
        .eq('owner_email', normalizedContact);

      agents = result.data || [];
      error = result.error;
    } else {
      const result = await supabaseAdmin
        .from('agents')
        .select('*')
        .eq('owner_phone', normalizedContact);

      agents = result.data || [];
      error = result.error;
    }

    if (error) {
      console.error('[DASHBOARD AUTH] Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to lookup agents', details: error.message || String(error) },
        { status: 500 }
      );
    }

    if (!agents || agents.length === 0) {
      console.log('[DASHBOARD AUTH] No agents found for contact:', normalizedContact);
      return NextResponse.json(
        { error: 'No agents found for this contact' },
        { status: 404 }
      );
    }

    console.log('[DASHBOARD AUTH] Found agents:', agents.length);

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
      contact: normalizedContact,
    });
  } catch (err: unknown) {
    console.error('[DASHBOARD AUTH] Server error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

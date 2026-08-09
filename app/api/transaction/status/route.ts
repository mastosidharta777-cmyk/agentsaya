import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/transaction/status?merchantRef=...
 * Polled by the QRIS modal to detect when payment is confirmed. Returns the
 * transaction + linked agent status, and the slug once the agent is PAID.
 *
 * The agents table only exposes public columns to the anon key (via column
 * grants), so knowledge_base/system_prompt are never returned here.
 */
export async function GET(req: NextRequest) {
  try {
    const ref = req.nextUrl.searchParams.get('merchantRef');
    if (!ref) {
      return NextResponse.json(
        { error: 'merchantRef is required.' },
        { status: 400 }
      );
    }

    const { data: tx, error } = await supabase
      .from('transactions')
      .select('id, merchant_ref, status, customer_name')
      .eq('merchant_ref', ref)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!tx) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Load the linked agent (public columns only — slug, agent_name, status).
    const { data: agent } = await supabase
      .from('agents')
      .select('custom_agent_slug, agent_name, payment_status, period_end, trial_ends_at, plan_tier')
      .eq('transaction_id', tx.id)
      .maybeSingle();

    return NextResponse.json({
      merchantRef: tx.merchant_ref,
      status: tx.status,
      slug: agent?.custom_agent_slug ?? null,
      agentName: agent?.agent_name ?? null,
      paymentStatus: agent?.payment_status ?? null,
      periodEnd: agent?.period_end ?? null,
      trialEndsAt: agent?.trial_ends_at ?? null,
      planType: agent?.plan_tier === 'trial' ? 'trial' : 'paid',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isSandbox as isIpaymuSandbox } from '@/lib/ipaymu';

/**
 * POST /api/simulate-payment
 * Development-only helper. Only enabled when iPaymu is in sandbox mode (no
 * live iPaymu keys). Marks the transaction PAID and internally triggers the
 * iPaymu webhook handler so the agent activation + WhatsApp + email
 * onboarding runs exactly as it would from the real gateway callback.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isIpaymuSandbox) {
      return NextResponse.json(
        { error: 'Simulate is disabled when live iPaymu keys are set.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { merchantRef } = body as { merchantRef?: string };
    if (!merchantRef) {
      return NextResponse.json(
        { error: 'merchantRef is required.' },
        { status: 400 }
      );
    }

    console.log('=== SIMULATE IPAYMU PAYMENT ===');
    console.log('Merchant ref:', merchantRef);

    const { data: tx, error } = await supabaseAdmin
      .from('transactions')
      .select('id, status, reference')
      .eq('merchant_ref', merchantRef)
      .maybeSingle();

    console.log('Transaction found:', tx);
    console.log('Transaction error:', error);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    if (tx.status === 'PAID') {
      console.log('Transaction already paid');
      return NextResponse.json({ success: true, message: 'Already paid' });
    }

    const base =
      process.env.NEXT_PUBLIC_BASE_URL ||
      `http://${req.headers.get('host') || 'localhost:3000'}`;

    const callbackBody = new URLSearchParams({
      status: 'success',
      reference_id: merchantRef,
      trx_id: tx.reference || `SIM-${Date.now()}`,
    }).toString();

    console.log('Calling iPaymu webhook:', `${base}/api/webhooks/ipaymu`);

    const webhookRes = await fetch(`${base}/api/webhooks/ipaymu`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: callbackBody,
    });

    console.log('Webhook response status:', webhookRes.status);

    const result = await webhookRes.json().catch(() => ({}));
    console.log('Webhook response:', result);

    return NextResponse.json({ success: webhookRes.ok, webhook: result });
  } catch (err: unknown) {
    console.error('Simulate payment error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

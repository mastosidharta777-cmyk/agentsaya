import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { isSandbox } from '@/lib/payment';

/**
 * POST /api/simulate-payment
 * Development-only helper. Only enabled in sandbox mode (no live Mayar keys).
 * Marks the transaction PAID and internally triggers the webhook handler so
 * the agent activation + WhatsApp + email onboarding runs exactly as it would
 * from the gateway.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isSandbox) {
      return NextResponse.json(
        { error: 'Simulate is disabled when live gateway keys are set.' },
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

    console.log('=== SIMULATE PAYMENT ===');
    console.log('Merchant ref:', merchantRef);

    // Use supabaseAdmin to bypass RLS
    const { data: tx, error } = await supabaseAdmin
      .from('transactions')
      .select('id, gateway_reference, status')
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

    const callbackBody = JSON.stringify({
      external_id: tx.gateway_reference,
      status: 'SUCCESS',
    });

    const base =
      process.env.NEXT_PUBLIC_APP_URL ||
      `http://${req.headers.get('host') || 'localhost:3000'}`;

    console.log('Calling webhook:', `${base}/api/webhook/payment`);

    const webhookRes = await fetch(`${base}/api/webhook/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': 'sandbox-signature',
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

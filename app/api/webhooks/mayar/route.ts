import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getMayarTransaction } from '@/lib/mayar';

// Mayar webhook delivery is only a trigger to verify with the Mayar API.
// Do not trust the incoming event's status, amount, email or transaction ID as proof of payment.
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > 16384) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });

    let payload: Record<string, unknown>;
    try { payload = JSON.parse(raw); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const event = (payload.event && typeof payload.event === 'object' ? (payload.event as Record<string, unknown>).received : payload.event) ?? payload['event.received'];
    if (event !== 'payment.received') return NextResponse.json({ received: true, ignored: true });

    const data = (payload.data && typeof payload.data === 'object' ? payload.data : {}) as Record<string, unknown>;
    // Mayar webhook documentation calls data.id a webhook ID, not necessarily a transaction ID.
    // Confirm candidate by matching our previously persisted provider transaction ID.
    const candidates = [data.transactionId, data.transaction_id, data.id]
      .filter((value): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value));

    let pending: any = null;
    let providerId = '';
    for (const candidate of candidates) {
      const { data: found, error } = await supabaseAdmin.from('transactions')
        .select('id, merchant_ref, agent_id, amount, payment_status, status, package_id, customer_email, reference')
        .eq('payment_method', 'mayar')
        .eq('reference', candidate)
        .maybeSingle();
      if (error) throw error;
      if (found) { pending = found; providerId = candidate; break; }
    }
    // Unknown payment may belong to another app using the same Mayar merchant.
    if (!pending) return NextResponse.json({ received: true, ignored: true });
    if (pending.status === 'PAID') return NextResponse.json({ received: true, duplicate: true });

    const verified = await getMayarTransaction(providerId);
    if (verified.status.toLowerCase() !== 'paid') {
      return NextResponse.json({ received: true, paymentConfirmed: false });
    }
    if (Number(verified.amount) !== Number(pending.amount)) {
      return NextResponse.json({ error: 'Amount mismatch' }, { status: 409 });
    }
    const verifiedEmail = verified.customer?.email;
    if (!verifiedEmail || verifiedEmail.trim().toLowerCase() !== String(pending.customer_email).trim().toLowerCase()) {
      return NextResponse.json({ error: 'Customer mismatch' }, { status: 409 });
    }

    // This RPC is deliberately NOT the legacy activate_agent function.
    // It must exist with execute privilege restricted to service_role and
    // perform an idempotent row-locked transaction + plan period update.
    const { data: activation, error: activationError } = await supabaseAdmin.rpc('activate_mayar_agent', {
      p_merchant_ref: pending.merchant_ref,
      p_provider_transaction_id: providerId,
      p_verified_amount: Number(verified.amount),
      p_verified_email: verifiedEmail,
    });
    if (activationError) {
      console.error('[MAYAR] activation RPC failed', activationError.code);
      return NextResponse.json({ error: 'Activation unavailable' }, { status: 503 });
    }
    return NextResponse.json({ received: true, activated: Boolean(activation) });
  } catch (error) {
    console.error('[MAYAR] webhook processing failed', error instanceof Error ? error.name : 'Unknown');
    return NextResponse.json({ error: 'Payment verification unavailable' }, { status: 503 });
  }
}

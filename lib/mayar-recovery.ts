/**
 * Low-cost payment recovery for an authenticated AgentSaya owner.
 * Invoked when the owner opens their dashboard, not by a public cron or
 * an unauthenticated browser-provided order ID.
 * Never activates sandbox transactions. All grants use provider-verified
 * request + settled transaction and an idempotent DB RPC.
 */
import { supabaseAdmin } from '@/lib/supabase';
import { isMayarLive, verifyAgentSayaSettlement } from '@/lib/mayar';

export async function recoverPendingMayarOrdersForOwner(ownerEmail: string): Promise<void> {
  if (!isMayarLive() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const email = ownerEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

  // Mayar checkout URLs expire within one hour. Allow late settlements, but
  // cap recovery to two outstanding orders to protect provider quotas.
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: orders, error } = await supabaseAdmin
    .from('transactions')
    .select('id, agent_id, amount, status, payment_method, package_id, customer_email, mayar_request_id, mayar_initial_transaction_id')
    .eq('payment_method', 'mayar')
    .eq('status', 'UNPAID')
    .eq('customer_email', email)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(2);

  if (error || !orders?.length) {
    if (error) console.warn('[MAYAR RECOVERY] Pending lookup unavailable');
    return;
  }
  await Promise.allSettled(orders.map(async (order) => {
    if (!order.agent_id || !order.mayar_request_id || !order.mayar_initial_transaction_id) return;
    if (order.package_id !== 'yearly' && order.package_id !== 'plan-basic') return;
    const plan = order.package_id === 'yearly' ? 'yearly' as const : 'monthly' as const;
    try {
      const settledId = await verifyAgentSayaSettlement({
        orderId: order.id, requestId: order.mayar_request_id,
        initialTransactionId: order.mayar_initial_transaction_id,
        plan, amount: Number(order.amount), email: order.customer_email,
      });
      if (!settledId) return;
      const { error: finalizeError } = await supabaseAdmin
        .rpc('finalize_mayar_agent_payment', {
          p_order_id: order.id,
          p_request_id: order.mayar_request_id,
          p_settled_transaction_id: settledId,
          p_amount: order.amount,
          p_email: order.customer_email,
        });
      if (finalizeError) console.error('[MAYAR RECOVERY] Verified payment activation needs retry', finalizeError.code);
    } catch {
      // Provider may be unavailable or settlement not yet visible.
      // Never declare payment completed unless verified.
      console.warn('[MAYAR RECOVERY] Pending order not yet verifiable');
    }
  }));
}

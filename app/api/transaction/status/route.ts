export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isMayarSandbox, isMayarLive, verifyAgentSayaSettlement } from '@/lib/mayar';
import { sendWhatsApp, buildAgentWelcomeMessage } from '@/lib/whatsapp';
import { sendEmail, buildAgentWelcomeEmail } from '@/lib/email';
import { buildEmbedCode } from '@/lib/agents';

// Public polling uses a cryptographically random, unguessable order reference.
// No browser-supplied status/amount is ever treated as proof of payment.
export async function GET(req: NextRequest) {
  const respond = (data: object, status = 200) =>
    NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return respond({ error: 'Database belum siap' }, 503);
  const ref = req.nextUrl.searchParams.get('merchantRef');
  if (!ref || !/^[0-9a-f-]{36}$/i.test(ref)) return respond({ error: 'Referensi tidak valid' }, 400);
  try {
    const { data: tx, error: txError } = await supabaseAdmin.from('transactions')
      .select('id,agent_id,merchant_ref,status,amount,package_id,payment_method,customer_email,mayar_request_id,mayar_initial_transaction_id,mayar_checkout_url')
      .eq('merchant_ref', ref).eq('payment_method','mayar').maybeSingle();
    if (txError) return respond({ error: 'Database tidak tersedia' }, 503);
    if (!tx) return respond({ error: 'Transaksi tidak ditemukan' }, 404);
    let status = tx.status;
    if (status !== 'PAID' && isMayarLive() && tx.mayar_request_id && tx.mayar_initial_transaction_id) {
      const plan = tx.package_id === 'yearly' ? 'yearly' : 'monthly';
      const settledId = await verifyAgentSayaSettlement({
        orderId: tx.id, requestId: tx.mayar_request_id,
        initialTransactionId: tx.mayar_initial_transaction_id,
        plan, amount: Number(tx.amount), email: tx.customer_email,
      });
      if (settledId) {
        const { data: firstSettlement, error: settleErr } = await supabaseAdmin
          .rpc('finalize_mayar_agent_payment', {
            p_order_id: tx.id, p_request_id: tx.mayar_request_id,
            p_settled_transaction_id: settledId,
            p_amount: tx.amount, p_email: tx.customer_email,
          });
        if (settleErr || typeof firstSettlement !== 'boolean') {
          console.error('[MAYAR] Settlement DB rejected', settleErr?.code);
          return respond({ error: 'Pembayaran terkonfirmasi tetapi aktivasi perlu pengecekan ulang' }, 503);
        }
        status = 'PAID';
        if (firstSettlement && tx.agent_id) {
          const { data: agent } = await supabaseAdmin.from('agents')
            .select('agent_name,custom_agent_slug,owner_name,owner_email,owner_phone,amount')
            .eq('id',tx.agent_id).maybeSingle();
          if (agent) {
            const origin = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.agentsaya.site';
            const chatUrl = origin + '/chat/' + agent.custom_agent_slug;
            // Nonessential notifications never roll back a legitimate payment.
            await Promise.allSettled([
              sendWhatsApp({ target: agent.owner_phone, message: buildAgentWelcomeMessage({
                customerName: agent.owner_name, agentName: agent.agent_name, chatUrl,
              }) }),
              sendEmail({ to: agent.owner_email, subject: 'AI Agent Aktif — ' + agent.agent_name,
                html: buildAgentWelcomeEmail({ customerName: agent.owner_name,
                  agentName: agent.agent_name, chatUrl,
                  embedCode: buildEmbedCode(agent.custom_agent_slug, origin),
                  amount: agent.amount }) }),
            ]);
          }
        }
      }
    }
    const { data: agent } = await supabaseAdmin.from('agents')
      .select('custom_agent_slug,agent_name,payment_status,period_end,trial_ends_at')
      .eq('id',tx.agent_id).maybeSingle();
    return respond({
      merchantRef: ref,
      status: status === 'PAID' ? 'PAID' : (isMayarSandbox() ? 'SANDBOX' : 'UNPAID'),
      slug: agent?.custom_agent_slug || null,
      agentName: agent?.agent_name || null,
      paymentStatus: agent?.payment_status || null,
      periodEnd: status === 'PAID' ? agent?.period_end : null,
      trialEndsAt: null,
      planType: 'paid',
      checkoutUrl: tx.mayar_checkout_url || null,
      sandbox: isMayarSandbox(),
    });
  } catch (err) {
    console.error('[MAYAR] Verification unavailable:', err instanceof Error ? err.message : 'unknown');
    return respond({ error: 'Verifikasi Mayar belum tersedia. Silakan periksa lagi.' }, 503);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { verifyWebhookSignature } from '@/lib/payment';
import { sendWhatsApp, buildAgentWelcomeMessage } from '@/lib/whatsapp';
import { sendEmail, buildAgentWelcomeEmail } from '@/lib/email';
import { buildEmbedCode } from '@/lib/agents';

/**
 * POST /api/webhook/payment
 * Mayar callback receiver. Verifies the gateway signature, then on PAID/SUCCESS:
 *   1. calls activate_agent() to flip the agent + transaction to PAID and
 *      set the 30-day window (privileged SECURITY DEFINER transition),
 *   2. sends a WhatsApp (Fonnte) + email (Resend) with the shareable link.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('X-Signature') || '';

  console.log('=== WEBHOOK PAYMENT ===');
  console.log('Signature:', signature);
  console.log('Body length:', rawBody.length);

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.log('Invalid signature');
    return NextResponse.json(
      { success: false, message: 'Invalid signature' },
      { status: 401 }
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.log('Invalid JSON');
    return NextResponse.json(
      { success: false, message: 'Invalid JSON' },
      { status: 400 }
    );
  }

  // Mayar webhook payload format handling
  const status = String(payload.status || '').toUpperCase();
  const reference = String(payload.external_id || payload.reference || '');

  console.log('Status:', status);
  console.log('Reference:', reference);

  if (!reference) {
    return NextResponse.json(
      { success: false, message: 'Missing reference' },
      { status: 400 }
    );
  }

  // Mayar uses 'SUCCESS' or 'PAID' status
  if (status !== 'PAID' && status !== 'SUCCESS') {
    console.log('Status not PAID/SUCCESS, skipping');
    return NextResponse.json({
      success: true,
      message: `Status: ${status}`,
      reference,
    });
  }

  try {
    console.log('Activating agent for reference:', reference);
    
    // Privileged PAID transition — finds the agent by its linked transaction
    // and activates it atomically. Runs as table owner (bypasses RLS).
    const { data: activated, error: actErr } = await supabaseAdmin
      .rpc('activate_agent', {
        p_merchant_ref: '',
        p_reference: reference,
      });

    console.log('Activation result:', activated);
    console.log('Activation error:', actErr);

    if (actErr) throw actErr;
    if (!activated || activated.length === 0) {
      console.log('Activation returned empty, trying fallback');
      // Try by reading the transaction first (fallback for sandbox refs)
      const { data: tx } = await supabaseAdmin
        .from('transactions')
        .select('merchant_ref')
        .eq('gateway_reference', reference)
        .maybeSingle();

      console.log('Transaction from reference:', tx);

      if (tx) {
        const { data: retry, error: retryErr } = await supabaseAdmin.rpc(
          'activate_agent',
          { p_merchant_ref: tx.merchant_ref, p_reference: reference }
        );
        if (retryErr) throw retryErr;
        if (!retry || retry.length === 0) {
          return NextResponse.json({
            success: true,
            message: 'No agent linked',
            reference,
          });
        }
        return NextResponse.json({
          success: true,
          reference,
          agent: retry[0],
        });
      }
      return NextResponse.json(
        { success: false, message: 'Agent not found for reference' },
        { status: 404 }
      );
    }

    const agent = activated[0];
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      `https://${req.headers.get('host') || 'localhost:3000'}`;
    const chatUrl = `${origin}/chat/${agent.custom_agent_slug}`;
    const embedCode = buildEmbedCode(agent.custom_agent_slug, origin);

    console.log('Agent activated:', agent.agent_name);
    console.log('Chat URL:', chatUrl);

    // Process referral bonus if this agent was referred
    await supabaseAdmin.rpc('process_referral_bonus', {
      p_new_agent_id: agent.id,
    });

    const [waResult, emailResult] = await Promise.all([
      sendWhatsApp({
        target: agent.owner_phone,
        message: buildAgentWelcomeMessage({
          customerName: agent.owner_name,
          agentName: agent.agent_name,
          chatUrl,
        }),
      }),
      sendEmail({
        to: agent.owner_email,
        subject: `AI Agent Aktif — ${agent.agent_name}`,
        html: buildAgentWelcomeEmail({
          customerName: agent.owner_name,
          agentName: agent.agent_name,
          chatUrl,
          embedCode,
          amount: agent.amount,
        }),
      }),
    ]);

    console.log('WhatsApp result:', waResult);
    console.log('Email result:', emailResult);

    return NextResponse.json({
      success: true,
      reference,
      agent: {
        slug: agent.custom_agent_slug,
        name: agent.agent_name,
        chatUrl,
      },
      whatsapp: waResult,
      email: emailResult,
    });
  } catch (err: unknown) {
    console.error('Webhook error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyIpaymuCallback } from '@/lib/ipaymu';
import { sendWhatsApp, buildAgentWelcomeMessage } from '@/lib/whatsapp';
import { sendEmail, buildAgentWelcomeEmail } from '@/lib/email';
import { buildEmbedCode } from '@/lib/agents';

/**
 * POST /api/webhooks/ipaymu
 * iPaymu callback receiver. Verifies the gateway signature, then on a SUCCESS
 * status flips the linked agent from PENDING/TRIAL to PAID (active) and the
 * 30-day window via the privileged activate_agent() RPC, then sends the
 * WhatsApp + email onboarding with the shareable link.
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';

  let params: Record<string, string> = {};
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const rawBody = await req.text();
    const urlParams = new URLSearchParams(rawBody);
    urlParams.forEach((value, key) => {
      params[key] = value;
    });
  } else {
    params = (await req.json()) as Record<string, string>;
  }

  console.log('=== WEBHOOK IPAYMU ===');
  console.log('Params:', JSON.stringify(params));

  if (!verifyIpaymuCallback(params)) {
    console.log('Invalid iPaymu signature');
    return NextResponse.json(
      { success: false, message: 'Invalid signature' },
      { status: 401 }
    );
  }

  const status = String(params.status || '').toLowerCase();
  const referenceId = String(
    params.reference_id || params.referenceId || ''
  );
  const trxId = String(params.trx_id || params.trxId || '');

  console.log('Status:', status, 'referenceId:', referenceId, 'trxId:', trxId);

  if (status !== 'success') {
    console.log('Status not success, skipping');
    return NextResponse.json({
      success: true,
      message: `Status: ${status}`,
      referenceId,
    });
  }

  if (!referenceId && !trxId) {
    return NextResponse.json(
      { success: false, message: 'Missing reference' },
      { status: 400 }
    );
  }

  try {
    // Persist the iPaymu transaction id for traceability (best-effort).
    if (trxId) {
      await supabaseAdmin
        .from('transactions')
        .update({ reference: trxId })
        .eq('merchant_ref', referenceId);
    }

    // Privileged PAID/active transition (bypasses RLS). Finds the agent by its
    // linked transaction (merchant_ref) and activates it atomically.
    const { data: activated, error: actErr } = await supabaseAdmin.rpc(
      'activate_agent',
      {
        p_merchant_ref: referenceId,
        p_reference: trxId,
      }
    );

    console.log('Activation result:', activated);
    console.log('Activation error:', actErr);

    if (actErr) throw actErr;
    if (!activated || activated.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Agent not found for reference' },
        { status: 404 }
      );
    }

    const agent = activated[0];
    const origin =
      process.env.NEXT_PUBLIC_BASE_URL ||
      `https://${req.headers.get('host') || 'localhost:3000'}`;
    const chatUrl = `${origin}/chat/${agent.custom_agent_slug}`;
    const embedCode = buildEmbedCode(agent.custom_agent_slug, origin);

    console.log('Agent activated:', agent.agent_name);
    console.log('Chat URL:', chatUrl);

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
      referenceId,
      agent: {
        slug: agent.custom_agent_slug,
        name: agent.agent_name,
        chatUrl,
      },
      whatsapp: waResult,
      email: emailResult,
    });
  } catch (err: unknown) {
    console.error('iPaymu webhook error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}

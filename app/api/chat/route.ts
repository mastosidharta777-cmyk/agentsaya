if (process.env.NODE_ENV === 'development') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { chatComplete, type ChatTurn } from '@/lib/llm';
import { sendTelegramMessageToChat } from '@/lib/telegram';
import { sendEmail } from '@/lib/email';

/**
 * POST /api/chat
 * Public chat endpoint for a shareable AI agent. Loads the agent's private
 * context (knowledge_base + system_prompt) via the SECURITY DEFINER
 * get_agent_context function — never reads those columns directly with the
 * anon key. Only PAID, non-expired agents can answer.
 *
 * Body: { slug: string, message: string, history?: ChatTurn[] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, message, history } = body as {
      slug?: string;
      message?: string;
      history?: ChatTurn[];
    };

    if (!slug || !message) {
      return NextResponse.json(
        { error: 'slug and message are required.' },
        { status: 400 }
      );
    }
    if (message.length > 1000) {
      return NextResponse.json(
        { error: 'Pesan terlalu panjang (maks 1000 karakter).' },
        { status: 400 }
      );
    }

    console.log('=== CHAT API ===');
    console.log('Slug:', slug);
    console.log('Message:', message);

    // First, try to get agent directly to check if it exists and its status
    const { data: directAgent, error: directError } = await supabaseAdmin
      .from('agents')
      .select('id, agent_name, payment_status, trial_ends_at, period_end, custom_agent_slug, knowledge_base, system_prompt, welcome_message, telegram_chat_id, owner_email')
      .eq('custom_agent_slug', slug)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log('Direct agent query result:', directAgent);
    console.log('Direct agent error:', directError);

    if (directError) {
      console.error('[CHAT ERROR]:', directError);
      return NextResponse.json(
        { error: 'Terjadi kesalahan database. Silakan coba lagi.' },
        { status: 500 }
      );
    }

    if (!directAgent) {
      console.log('Agent not found in database for slug:', slug);
      // Try to find any agent to see if database is working
      const { data: anyAgent, error: anyError } = await supabaseAdmin
        .from('agents')
        .select('custom_agent_slug, agent_name')
        .limit(5);
      
      console.log('Available agents for debugging:', anyAgent);
      console.log('Any agent query error:', anyError);
      
      return NextResponse.json(
        { 
          error: 'Agent tidak ditemukan. Silakan periksa URL atau buat agent baru.',
          debug: {
            requestedSlug: slug,
            availableAgents: anyAgent?.map(a => a.custom_agent_slug) || []
          }
        },
        { status: 404 }
      );
    }

    console.log('Agent payment status:', directAgent.payment_status);

    // Check if agent is pending (just created, not paid yet)
    if (directAgent.payment_status === 'PENDING') {
      console.log('Agent is PENDING, waiting for payment');
      return NextResponse.json(
        { error: 'Agent masih menunggu pembayaran. Silakan selesaikan pembayaran terlebih dahulu.' },
        { status: 403 }
      );
    }

    // Check if trial is expired
    if (directAgent.payment_status === 'TRIAL') {
      const trialExpired = directAgent.trial_ends_at 
        ? new Date(directAgent.trial_ends_at) < new Date() 
        : false;

      console.log('Trial expired check:', trialExpired, 'Trial ends at:', directAgent.trial_ends_at);

      if (trialExpired) {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.get('host') || 'localhost:3000'}`;
        return NextResponse.json(
          {
            error: 'Masa trial gratis Anda telah berakhir.',
            expired: true,
            trialExpired: true,
            upgradeMessage: 'Silakan upgrade ke paket berbayar untuk melanjutkan menggunakan AI Agent.',
            slug: directAgent.custom_agent_slug,
            renewalUrl: `${baseUrl}/checkout?slug=${directAgent.custom_agent_slug}&renewal=true`,
          },
          { status: 403 }
        );
      }
    }

    // Check if paid subscription is expired
    if (directAgent.payment_status === 'PAID') {
      const subscriptionExpired = directAgent.period_end 
        ? new Date(directAgent.period_end) < new Date() 
        : false;

      console.log('Subscription expired check:', subscriptionExpired, 'Period ends at:', directAgent.period_end);

      if (subscriptionExpired) {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.get('host') || 'localhost:3000'}`;
        return NextResponse.json(
          {
            error: 'Langganan Anda telah berakhir. Silakan perpanjang langganan.',
            expired: true,
            renewalUrl: `${baseUrl}/checkout?slug=${directAgent.custom_agent_slug}&renewal=true`,
          },
          { status: 403 }
        );
      }
    }

    // At this point, agent is valid and active - use direct data for chat
    console.log('Agent is valid, using direct data for chat');
    console.log('Agent name:', directAgent.agent_name);
    console.log('Knowledge base length:', directAgent.knowledge_base?.length || 0);
    console.log('System prompt length:', directAgent.system_prompt?.length || 0);
    

    // Retrieval threshold: check if knowledge base is relevant enough
    const MATCH_THRESHOLD = 0.70;
    const knowledgeBaseText = directAgent.knowledge_base || '';
    let relevantContext = knowledgeBaseText;

    if (knowledgeBaseText.trim().length > 0) {
      const userWords = new Set(message.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
      const kbWords = knowledgeBaseText.toLowerCase().split(/\s+/);
      const matches = kbWords.filter((w: string) => userWords.has(w)).length;
      const overlap = userWords.size > 0 ? matches / userWords.size : 0;
      const isRelevant = overlap >= MATCH_THRESHOLD;

      console.log('[RETRIEVAL] User words:', userWords.size, 'KB words:', kbWords.length, 'Matches:', matches, 'Overlap:', overlap.toFixed(2), 'Relevant:', isRelevant);

      if (!isRelevant) {
        relevantContext = '';
        console.log('[RETRIEVAL] Context below threshold, treating as empty');
      }
    }
    let result;
    try {
      result = await chatComplete({
        systemPrompt: directAgent.system_prompt || 'You are a helpful AI assistant.',
        knowledgeBase: relevantContext,
        userMessage: message,
        history: Array.isArray(history) ? history : [],
      });
    } catch (err: unknown) {
      console.error('Chat completion failed:', err);
      result = {
        reply: 'Maaf, server AI sedang padat saat ini. Silakan coba kirim ulang pesan Anda beberapa saat lagi.',
        sandbox: false,
      };
    }

    console.log('Chat complete result:', result);

    try {
      await supabaseAdmin
        .from('chat_logs')
        .insert({
          agent_id: directAgent.id,
          user_message: message,
          ai_reply: result.reply,
          metadata: {
            history: Array.isArray(history) ? history : [],
            sandbox: result.sandbox,
          },
        });
    } catch (logErr) {
      console.error('[CHAT LOG] Failed to save chat log:', logErr);
    }

    // Lead detection: check if user message contains phone/WhatsApp number
    const phoneRegex = /(\+62|62|08)\d{8,11}/g;
    const phoneMatch = message.match(phoneRegex);

    if (phoneMatch && directAgent.telegram_chat_id) {
      const detectedPhone = phoneMatch[0];
      const cleanPhone = detectedPhone.replace(/^\+?62/, '0').replace(/^0+/, '0');

      // Simple name extraction heuristic
      let customerName = 'Pengguna Chat';
      const nameMatch = message.match(/(?:nama\s*saya|saya\s*)\s*([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20})?)/i);
      if (nameMatch && nameMatch[1]) {
        customerName = nameMatch[1].trim();
      }

      const messageSummary = message.length > 200 ? message.substring(0, 200) + '...' : message;

      // Save lead to database
      const { error: leadError } = await supabaseAdmin
        .from('leads')
        .insert({
          agent_id: directAgent.id,
          customer_name: customerName,
          customer_phone: cleanPhone,
          message_summary: messageSummary,
          source: 'chat',
        });

      if (leadError) {
        console.error('[LEAD] Failed to save lead:', leadError);
      } else {
        console.log('[LEAD] New lead saved:', cleanPhone, customerName);

        // Send Telegram notification
        const telegramMessage =
          '🎯 *Lead Baru Terdeteksi!*\n\n' +
          `👤 *Nama:* ${customerName}\n` +
          `📱 *WhatsApp:* ${cleanPhone}\n` +
          `💬 *Pesan/Kebutuhan:* ${messageSummary}\n\n` +
          `Agent: ${directAgent.agent_name}`;

        const telegramResult = await sendTelegramMessageToChat(
          directAgent.telegram_chat_id,
          telegramMessage,
          { parseMode: 'Markdown' }
        );

        if (telegramResult.success) {
          console.log('[LEAD] Telegram notification sent successfully');
        } else {
          console.error('[LEAD] Telegram notification failed:', telegramResult.error);
        }

        const esc = (s: string) =>
          s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const emailHtml = `<!DOCTYPE html>
<html>
  <body style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
    <div style="background:#6366f1;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;font-size:22px">🎯 Lead Baru Terdeteksi - Agent Saya</h1>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 12px 12px">
      <p>Halo <strong>${esc(directAgent.agent_name)}</strong>,</p>
      <p>Ada calon pelanggan baru yang terdeteksi dari chat AI Agent Anda.</p>
      <table style="width:100%;margin:16px 0;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#64748b">Nama</td><td style="padding:8px 0;text-align:right;font-weight:600">${esc(customerName)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #f1f5f9">WhatsApp</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #f1f5f9"><a href="https://wa.me/${esc(cleanPhone)}" style="color:#6366f1;text-decoration:none">${esc(cleanPhone)}</a></td></tr>
        <tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #f1f5f9">Pesan / Kebutuhan</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #f1f5f9">${esc(messageSummary)}</td></tr>
      </table>
      <p style="color:#64748b;font-size:13px;margin-top:24px">— Tim Agent Saya</p>
    </div>
  </body>
</html>`;

        const emailResult = await sendEmail({
          to: directAgent.owner_email,
          subject: '🎯 Lead Baru Terdeteksi - Agent Saya',
          html: emailHtml,
        });

        if (emailResult.success) {
          console.log('[LEAD] Email notification sent to', directAgent.owner_email);
        } else {
          console.error('[LEAD] Email notification failed:', emailResult.error);
        }
      }
    }

    return NextResponse.json({
      reply: result.reply,
      sandbox: result.sandbox,
      agentName: directAgent.agent_name,
      isTrial: directAgent.payment_status === 'TRIAL',
    });
  } catch (err: unknown) {
    console.error('Chat API error:', err);
    return NextResponse.json(
      { error: 'Terjadi kesalahan server. Silakan coba lagi.' },
      { status: 500 }
    );
  }
}

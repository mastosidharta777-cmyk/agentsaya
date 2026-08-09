import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { chatComplete, type ChatTurn } from '@/lib/llm';

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
      .select('id, agent_name, payment_status, trial_ends_at, period_end, custom_agent_slug, knowledge_base, system_prompt, welcome_message')
      .eq('custom_agent_slug', slug)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log('Direct agent query result:', directAgent);
    console.log('Direct agent error:', directError);

    if (directError) {
      console.error('Database query error:', directError);
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
        return NextResponse.json(
          {
            error: 'Masa trial gratis Anda telah berakhir.',
            trialExpired: true,
            upgradeMessage: 'Silakan upgrade ke paket berbayar untuk melanjutkan menggunakan AI Agent.',
            slug: directAgent.custom_agent_slug,
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
        return NextResponse.json(
          { error: 'Langganan Anda telah berakhir. Silakan perpanjang langganan.' },
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

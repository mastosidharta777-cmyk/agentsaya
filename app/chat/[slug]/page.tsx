import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ChatInterface } from '@/components/ChatInterface';

/**
 * /chat/[slug] — public AI agent chat page.
 *
 * This is a Server Component. It loads only the PUBLIC columns of the agent
 * (agent_name, welcome_message) via the anon key. The private knowledge_base
 * and system_prompt are never loaded here — the /api/chat route reads those
 * through the SECURITY DEFINER get_agent_context function at message time.
 *
 * Only PAID agents are visible (enforced by the RLS SELECT policy).
 */
export default async function ChatPage({
  params,
}: {
  params: { slug: string };
}) {
  const { data: agent } = await supabase
    .from('agents')
    .select('agent_name, welcome_message, custom_agent_slug')
    .eq('custom_agent_slug', params.slug)
    .maybeSingle();

  if (!agent) {
    notFound();
  }

  return (
    <ChatInterface
      agentName={agent.agent_name}
      welcomeMessage={agent.welcome_message}
      slug={agent.custom_agent_slug}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}) {
  const { data: agent } = await supabase
    .from('agents')
    .select('agent_name')
    .eq('custom_agent_slug', params.slug)
    .maybeSingle();

  return {
    title: agent ? `${agent.agent_name} — AI Assistant` : 'AI Assistant',
    description: `Chat dengan ${agent?.agent_name || 'AI assistant'}`,
  };
}

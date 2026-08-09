import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ChatInterface } from '@/components/ChatInterface';

/**
 * /embed/[slug] — iframe-friendly widget embed for AI agent chat.
 *
 * This is a Server Component optimized for embedding in external websites.
 * It loads only the PUBLIC columns of the agent and provides a clean,
 * compact chat UI suitable for iframes.
 *
 * Only PAID agents are visible (enforced by the RLS SELECT policy).
 */
export default async function EmbedPage({
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
    <div className="h-screen w-full bg-background">
      <ChatInterface
        agentName={agent.agent_name}
        welcomeMessage={agent.welcome_message}
        slug={agent.custom_agent_slug}
        isEmbed={true}
      />
    </div>
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

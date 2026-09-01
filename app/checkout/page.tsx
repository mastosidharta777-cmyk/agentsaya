import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { CheckoutForm } from '@/components/CheckoutForm';

interface CheckoutPageProps {
  params: { slug: string };
  searchParams: { renewal?: string; plan?: string };
}

export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const isRenewal = searchParams.renewal === 'true';
  const preselectedPlan = (searchParams.plan as 'trial' | 'monthly' | 'yearly') || (isRenewal ? 'monthly' : 'trial');

  const { data: agent } = await supabase
    .from('agents')
    .select('id, agent_name, custom_agent_slug, owner_name, owner_email, owner_phone, payment_status, period_end, plan_tier, welcome_message, knowledge_base')
    .eq('custom_agent_slug', params.slug)
    .maybeSingle();

  if (!agent) {
    notFound();
  }

  if (!isRenewal && agent.payment_status === 'PAID' && agent.period_end && new Date(agent.period_end) > new Date()) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-primary/5 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-xl p-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
            <CheckCircleIcon />
          </div>
          <h1 className="text-2xl font-bold mb-2">Agent Sudah Aktif</h1>
          <p className="text-muted-foreground mb-6">
            Agent <strong>{agent.agent_name}</strong> sudah aktif sampai{' '}
            <strong>{new Date(agent.period_end).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Ke Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-primary/5">
      <div className="container mx-auto p-4 md:p-8 max-w-5xl">
        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6">
          ← Kembali ke Beranda
        </Link>

        {isRenewal && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <h2 className="font-semibold text-amber-900">Perpanjang Langganan</h2>
            <p className="text-sm text-amber-700 mt-1">
              Agent <strong>{agent.agent_name}</strong> sudah tidak aktif atau akan segera berakhir. Pilih paket untuk mengaktifkan kembali.
            </p>
          </div>
        )}

        <CheckoutForm
          slug={agent.custom_agent_slug}
          agentName={agent.agent_name}
          welcomeMessage={agent.welcome_message || ''}
          knowledgeBase={agent.knowledge_base || ''}
          ownerName={agent.owner_name}
          ownerEmail={agent.owner_email}
          ownerPhone={agent.owner_phone}
          isRenewal={isRenewal}
          preselectedPlan={preselectedPlan}
        />
      </div>
    </div>
  );
}

function CheckCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

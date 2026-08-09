export interface Plan {
  id: string;
  tier: string;
  name: string;
  description: string;
  priceMonthly: number;
  features: string[];
  highlight: string | null;
  trialDays?: number;
}

export const TRIAL_PLAN: Plan = {
  id: 'plan-trial',
  tier: 'trial',
  name: 'Free Trial 3 Hari',
  description:
    'Coba AI Agent gratis selama 3 hari. Full akses ke semua fitur Basic Plan.',
  priceMonthly: 0,
  trialDays: 3,
  features: [
    '1 AI Agent custom',
    'Knowledge base sendiri',
    'Welcome message custom',
    'Link chat shareable',
    'Embed code untuk website',
    'Aktif 3 hari',
    'Upgrade kapan saja',
  ],
  highlight: 'GRATIS',
};

export const BASIC_PLAN: Plan = {
  id: 'plan-basic',
  tier: 'basic',
  name: 'Basic Plan',
  description:
    '1 AI Agent dengan custom knowledge base. Aktif 30 hari, link shareable + embed code.',
  priceMonthly: 49000,
  features: [
    '1 AI Agent custom',
    'Knowledge base sendiri',
    'Welcome message custom',
    'Link chat shareable',
    'Embed code untuk website',
    'Aktif 30 hari',
  ],
  highlight: 'Mulai Rp 49.000',
};

export const PLANS: Plan[] = [TRIAL_PLAN, BASIC_PLAN];

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

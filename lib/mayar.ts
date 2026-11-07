/**
 * Mayar production API v2. Server-side only: never import into client components.
 * Docs: https://docs.mayar.id/api-reference-v2/invoice/create
 *       https://docs.mayar.id/api-reference-v2/transaction/detail
 */
const API_BASE = 'https://api.mayar.id';

type MayarEnvelope<T> = {
  statusCode: number;
  messages: string;
  data: T;
};

export type CreatedMayarInvoice = {
  id: string;
  transactionId: string;
  link: string;
  expiredAt?: number;
};

export type MayarTransaction = {
  id: string;
  amount: number;
  status: string;
  customer?: { email?: string };
  paymentLink?: { id?: string };
};

async function mayarRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.MAYAR_API_KEY;
  if (!key) throw new Error('MAYAR_API_KEY belum dikonfigurasi');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(API_BASE + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    const result = await response.json() as MayarEnvelope<T>;
    if (!response.ok || result.statusCode !== 200 || !result.data) {
      // No sensitive provider response bodies in user-facing errors.
      throw new Error(`Mayar API rejected request (HTTP ${response.status})`);
    }
    return result.data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createMayarInvoice(args: {
  merchantRef: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  plan: 'monthly' | 'yearly';
  amount: number;
  agentId: string;
  renewal: boolean;
}): Promise<CreatedMayarInvoice> {
  if (!Number.isInteger(args.amount) || args.amount <= 0) {
    throw new Error('Invalid invoice amount');
  }
  const planName = args.plan === 'yearly' ? 'Yearly 365 Hari' : 'Basic 30 Hari';
  const invoice = await mayarRequest<CreatedMayarInvoice>('/hl/v2/invoices/create', {
    method: 'POST',
    body: JSON.stringify({
      name: args.customerName,
      email: args.customerEmail,
      mobile: args.customerPhone,
      description: `AgentSaya - ${planName} - ${args.merchantRef}`,
      expiredAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      items: [{ quantity: 1, rate: args.amount, description: `AgentSaya ${planName}` }],
      extraData: {
        app: 'agentsaya',
        merchantRef: args.merchantRef,
        agentId: args.agentId,
        plan: args.plan,
        renewal: args.renewal,
      },
    }),
  });
  if (!invoice.id || !invoice.transactionId || !invoice.link) {
    throw new Error('Incomplete Mayar invoice response');
  }
  const url = new URL(invoice.link);
  if (url.protocol !== 'https:') throw new Error('Invalid Mayar payment URL');
  return invoice;
}

export async function getMayarTransaction(transactionId: string): Promise<MayarTransaction> {
  if (!/^[a-z0-9-]{10,80}$/i.test(transactionId)) {
    throw new Error('Invalid Mayar transaction ID');
  }
  const tx = await mayarRequest<MayarTransaction>(
    `/hl/v2/transactions/${encodeURIComponent(transactionId)}`
  );
  if (tx.id !== transactionId) throw new Error('Mayar transaction ID mismatch');
  return tx;
}

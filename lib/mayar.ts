/**
 * AgentSaya Mayar v2 integration. SERVER ONLY.
 * No checkout or settlement is allowed without explicit environment configuration.
 * The Mayar request is bound to an immutable local transaction before payment.
 */
type Obj = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE_PROD = 'https://api.mayar.id/hl/v2';
const BASE_SANDBOX = 'https://api.mayar.io/hl/v2';
const BASE_SANDBOX_ALT = 'https://api.mayar.club/hl/v2';

export const isMayarSandbox = () => process.env.MAYAR_ENV === 'sandbox';
export const isMayarLive = () => process.env.MAYAR_ENV === 'production' &&
  process.env.MAYAR_ENABLE_LIVE_CHECKOUT === 'true';
export function requireMayarConfigured(): void {
  if (!isMayarSandbox() && !isMayarLive()) {
    throw new Error('Pembayaran Mayar belum diaktifkan. Free trial tetap tersedia.');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Server database belum siap.');
}
const obj = (x: unknown): Obj | null =>
  x && typeof x === 'object' && !Array.isArray(x) ? x as Obj : null;
const uuid = (x: unknown): x is string => typeof x === 'string' && UUID.test(x);
const amountValue = (x: unknown): number =>
  typeof x === 'number' && Number.isSafeInteger(x) ? x :
  typeof x === 'string' && /^[0-9]{1,10}$/.test(x) ? Number(x) : -1;
function config() {
  requireMayarConfigured();
  const sandbox = isMayarSandbox();
  const token = (sandbox ? process.env.MAYAR_SANDBOX_API_KEY : process.env.MAYAR_API_KEY)?.trim();
  if (!token) throw new Error('Kunci API Mayar belum dikonfigurasi.');
  const override = process.env.MAYAR_SANDBOX_API_BASE?.trim();
  if (sandbox && override && override !== BASE_SANDBOX && override !== BASE_SANDBOX_ALT) {
    throw new Error('Host sandbox Mayar tidak dikenal.');
  }
  return { base: sandbox ? (override || BASE_SANDBOX) : BASE_PROD, token };
}
async function mayar(path: string, body?: Obj): Promise<Obj> {
  const { base, token } = config();
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: 'Bearer ' + token, accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('API Mayar HTTP ' + res.status);
  const root = obj(await res.json());
  const data = obj(root?.statusCode === 200 ? root?.data : null);
  if (!data) throw new Error('Respons API Mayar tidak valid.');
  return data;
}
function trustedLink(x: unknown): x is string {
  if (typeof x !== 'string') return false;
  try {
    const u = new URL(x);
    const host = u.hostname.toLowerCase();
    const normal = ['.myr.id', '.mayar.id', '.mayar.io'].some(s => host.endsWith(s) && host !== s.slice(1));
    const sandboxMerchant = isMayarSandbox() && (host === 'hnj-indonesia.myr.lat' || host === 'hnj-indonesia.myr.wtf');
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.hash &&
      /^\/pl\/[A-Za-z0-9_-]{6,80}\/?$/.test(u.pathname) && !u.search &&
      (normal || sandboxMerchant);
  } catch { return false; }
}
export function mayarDescription(orderId: string, plan: 'monthly' | 'yearly') {
  return 'AGENTSAYA:' + orderId + ':' + plan;
}
export async function createAgentSayaPayment(input: {
  orderId: string; plan: 'monthly' | 'yearly'; amount: number; email: string; phone: string;
}): Promise<{ requestId: string; initialTransactionId: string; checkoutUrl: string }> {
  if (!uuid(input.orderId) || input.amount !== (input.plan === 'yearly' ? 399000 : 49000)) {
    throw new Error('Nominal pesanan Mayar tidak valid.');
  }
  const description = mayarDescription(input.orderId, input.plan);
  const data = await mayar('/payments/create', {
    name: 'AgentSaya ' + (input.plan === 'yearly' ? 'Tahunan' : 'Bulanan'),
    amount: input.amount,
    email: input.email.toLowerCase().trim(),
    mobile: input.phone,
    description,
    extraData: { app: 'agentsaya', orderId: input.orderId },
    expiredAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  if (!uuid(data.id) || !uuid(data.transactionId)) throw new Error('ID pembayaran Mayar tidak valid.');
  const detail = await mayar('/payments/' + encodeURIComponent(data.id));
  if (detail.id !== data.id || detail.type !== 'payment_request' ||
      amountValue(detail.amount) !== input.amount || detail.description !== description) {
    throw new Error('Detail pembayaran Mayar tidak cocok.');
  }
  const checkoutUrl = [data.link, detail.linkPayment, detail.linkUrl].find(trustedLink);
  if (!checkoutUrl) throw new Error('URL pembayaran Mayar belum terverifikasi. Jangan membayar.');
  return { requestId: data.id, initialTransactionId: data.transactionId, checkoutUrl };
}
/** Fail closed. Never settle from a browser/Webhook status or sandbox payment. */
export async function verifyAgentSayaSettlement(input: {
  orderId: string; requestId: string; initialTransactionId: string;
  plan: 'monthly' | 'yearly'; amount: number; email: string;
}): Promise<string | null> {
  if (!isMayarLive()) return null; // Sandbox must not activate real agents.
  if (!uuid(input.orderId) || !uuid(input.requestId) || !uuid(input.initialTransactionId)) return null;
  if (input.amount !== (input.plan === 'yearly' ? 399000 : 49000)) return null;
  const detail = await mayar('/payments/' + encodeURIComponent(input.requestId));
  if (detail.id !== input.requestId || detail.type !== 'payment_request' ||
      amountValue(detail.amount) !== input.amount ||
      detail.description !== mayarDescription(input.orderId, input.plan)) {
    throw new Error('Identitas request Mayar tidak sesuai.');
  }
  if (detail.status !== 'paid') return null;
  const candidates: string[] = [];
  const add = (x: unknown) => { if (uuid(x) && !candidates.includes(x) && candidates.length < 8) candidates.push(x); };
  const related = Array.isArray(detail.transactions) ? detail.transactions : [];
  for (const t of related.slice(0, 8)) { const row = obj(t); add(row?.id); add(row?.transactionId); }
  add(input.initialTransactionId);
  for (const id of candidates) {
    let tx: Obj;
    try { tx = await mayar('/transactions/' + encodeURIComponent(id)); }
    catch { continue; }
    if (tx.status !== 'paid') continue;
    const link = obj(tx.paymentLink);
    const customer = obj(tx.customer) || obj(tx.givenCustomer);
    const extra = obj(tx.extraData);
    if (tx.id !== id || link?.id !== input.requestId ||
        amountValue(tx.amount) !== input.amount ||
        String(customer?.email || '').toLowerCase() !== input.email.toLowerCase().trim() ||
        (extra?.orderId != null && extra.orderId !== input.orderId)) {
      throw new Error('Transaksi Mayar terbayar tetapi datanya tidak cocok.');
    }
    return id;
  }
  return null; // Request paid is not enough without verified settled transaction.
}

/**
 * Mayar.id payment gateway integration.
 *
 * In production, set MAYAR_API_KEY and MAYAR_SECRET_KEY. When those are
 * absent (development / demo), the module runs in SANDBOX mode: it generates a
 * realistic QRIS payload and a fake merchant reference so the full checkout →
 * webhook → onboarding flow can be exercised end-to-end without a live gateway.
 */

const MAYAR_BASE = process.env.MAYAR_BASE_URL || 'https://api.mayar.id/hl/v1';
const MAYAR_API_KEY = process.env.MAYAR_API_KEY || '';
const MAYAR_SECRET_KEY = process.env.MAYAR_SECRET_KEY || '';
const SANDBOX = !MAYAR_API_KEY || !MAYAR_SECRET_KEY;

export interface QrisPaymentRequest {
  merchantRef: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  packageName: string;
}

export interface QrisPaymentResult {
  merchantRef: string;
  reference: string;
  qrisString: string;
  qrImageUrl?: string;
  checkoutUrl?: string;
  status: string;
  sandbox: boolean;
}

/**
 * Mayar signs requests with HMAC-SHA256 of the JSON body using the secret key.
 * See Mayar documentation for the exact spec.
 */
function sign(body: Record<string, unknown>): string {
  const crypto = require('crypto') as typeof import('crypto');
  const json = JSON.stringify(body);
  return crypto
    .createHmac('sha256', MAYAR_SECRET_KEY)
    .update(json)
    .digest('hex');
}

/**
 * Builds a self-contained QRIS payload string. This is intentionally a
 * deterministic-but-valid-looking EMVCo QR structure for sandbox display only;
 * it is NOT a live-collectible code. In production, the real code comes from
 * Mayar's /payment/create response.
 */
function sandboxQrisPayload(ref: string): string {
  const id = ref.replace(/[^A-Z0-9]/gi, '').slice(0, 12).toUpperCase();
  return [
    '00020101021226', // QRIS merchant account template
    '58ID1234AIMDO00',
    'ID' + id,
    '53039360', // currency 936 = IDR
    '5802ID',
    '5913AGENTKU DEMO',
    '6009JAKARTAID',
    '610540000',
    '62270503', // CRC placeholder segment
    '6304',
    'A1B2',
  ].join('');
}

export async function createQrisPayment(
  req: QrisPaymentRequest
): Promise<QrisPaymentResult> {
  if (SANDBOX) {
    const reference = 'SANDBOX-' + req.merchantRef;
    const qrisString = sandboxQrisPayload(reference);
    return {
      merchantRef: req.merchantRef,
      reference,
      qrisString,
      status: 'UNPAID',
      sandbox: true,
    };
  }

  const body = {
    amount: req.amount,
    description: req.packageName,
    customer_name: req.customerName,
    customer_email: req.customerEmail,
    customer_phone: req.customerPhone,
    external_id: req.merchantRef,
    expired_time: Math.floor(Date.now() / 1000) + 3600,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/success`,
    type: 'QRIS',
    signature: sign({
      amount: req.amount,
      external_id: req.merchantRef,
    }),
  };

  const res = await fetch(`${MAYAR_BASE}/payment/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MAYAR_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mayar create failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const data = json.data ?? json;

  return {
    merchantRef: req.merchantRef,
    reference: data.external_id || data.reference,
    qrisString: data.qris_string || data.qris_data,
    qrImageUrl: data.qris_url,
    checkoutUrl: data.payment_url || data.checkout_url,
    status: data.status || 'UNPAID',
    sandbox: false,
  };
}

export interface PaymentStatusResult {
  status: 'PAID' | 'UNPAID' | 'EXPIRED' | 'FAILED' | 'SUCCESS';
  reference: string;
  amount?: number;
  paidAt?: string;
  sandbox: boolean;
}

export async function getPaymentStatus(
  reference: string
): Promise<PaymentStatusResult> {
  if (SANDBOX) {
    return {
      status: 'UNPAID',
      reference,
      sandbox: true,
    };
  }

  const res = await fetch(
    `${MAYAR_BASE}/payment/detail?external_id=${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${MAYAR_API_KEY}` } }
  );
  if (!res.ok) throw new Error(`Mayar detail failed (${res.status})`);
  const json = await res.json();
  const data = json.data ?? json;
  return {
    status: data.status,
    reference: data.external_id || data.reference,
    amount: data.amount,
    paidAt: data.paid_at,
    sandbox: false,
  };
}

/**
 * Verifies a Mayar webhook callback signature.
 * Mayar sends `X-Signature` = SHA256(secret_key + json_body).
 */
export function verifyWebhookSignature(
  jsonBody: string,
  signature: string | null
): boolean {
  if (SANDBOX) {
    // In sandbox we accept a dev sentinel signature so the simulate-payment
    // route can exercise the webhook without external credentials.
    return signature === 'sandbox-signature' || signature === '';
  }
  if (!signature) return false;
  const crypto = require('crypto') as typeof import('crypto');
  const expected = crypto
    .createHash('sha256')
    .update(MAYAR_SECRET_KEY + jsonBody)
    .digest('hex');
  return expected === signature;
}

export const isSandbox = SANDBOX;

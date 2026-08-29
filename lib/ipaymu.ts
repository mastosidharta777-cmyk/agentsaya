/**
 * iPaymu payment gateway integration (API v2 — Redirect Payment).
 *
 * Uses IPAYMU_VA, IPAYMU_API_KEY and IPAYMU_MODE from the environment.
 * When IPAYMU_MODE is anything other than "production"/"live" the module runs
 * against the iPaymu Sandbox (sandbox.ipaymu.com) so the full checkout →
 * redirect → webhook → activation flow can be exercised end-to-end.
 *
 * Reference: https://docs.ipaymu.com/en/docs/payment/redirect-payment
 */

const IPAYMU_VA = process.env.IPAYMU_VA || '';
const IPAYMU_API_KEY = process.env.IPAYMU_API_KEY || process.env.IPAYMU_API_SANDBOX_KEY || '';
const IPAYMU_MODE = (process.env.IPAYMU_MODE || 'sandbox').toLowerCase();
const IS_SANDBOX = IPAYMU_MODE !== 'production' && IPAYMU_MODE !== 'live';

const BASE_URL = IS_SANDBOX
  ? 'https://sandbox.ipaymu.com'
  : 'https://my.ipaymu.com';

export const isSandbox = IS_SANDBOX;

export interface IpaymuPaymentRequest {
  /** Your unique transaction id (used as iPaymu referenceId). */
  referenceId: string;
  productName: string;
  price: number;
  buyerName?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  returnUrl: string;
  notifyUrl: string;
  cancelUrl: string;
  expiredHours?: number;
}

export interface IpaymuPaymentResult {
  url: string;
  sessionId: string;
  referenceId: string;
  sandbox: boolean;
}

function sha256Hex(input: string): string {
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * iPaymu v2 request signature:
 *   StringToSign = "POST:${va}:${sha256(body)}:${apiKey}"
 *   signature    = HMAC-SHA256(StringToSign, apiKey)
 */
function sign(body: Record<string, unknown>): string {
  const crypto = require('crypto') as typeof import('crypto');
  const bodyHash = sha256Hex(JSON.stringify(body));
  const stringToSign = `POST:${IPAYMU_VA}:${bodyHash}:${IPAYMU_API_KEY}`;
  return crypto
    .createHmac('sha256', IPAYMU_API_KEY)
    .update(stringToSign)
    .digest('hex');
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

/**
 * Creates an iPaymu redirect payment and returns the payment page URL that the
 * browser should be redirected to.
 */
export async function createIpaymuPayment(
  req: IpaymuPaymentRequest
): Promise<IpaymuPaymentResult> {
  if (!IPAYMU_VA || !IPAYMU_API_KEY) {
    throw new Error(
      'IPAYMU_VA dan IPAYMU_API_KEY harus diisi di file .env.local'
    );
  }

  const body = {
    product: [req.productName],
    qty: ['1'],
    price: [String(req.price)],
    description: [req.productName],
    buyerName: req.buyerName || '',
    buyerEmail: req.buyerEmail || '',
    buyerPhone: req.buyerPhone || '',
    notifyUrl: req.notifyUrl ? sanitizeUrlForIpaymu(req.notifyUrl) : 'https://example.com/notify',
    returnUrl: req.returnUrl ? sanitizeUrlForIpaymu(req.returnUrl) : 'https://example.com/return',
    cancelUrl: req.cancelUrl ? sanitizeUrlForIpaymu(req.cancelUrl) : 'https://example.com/cancel',
    referenceId: req.referenceId,
    expired: req.expiredHours ?? 24,
  };

  const signature = sign(body);
  const ts = timestamp();

  const res = await fetch(`${BASE_URL}/api/v2/payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      va: IPAYMU_VA,
      signature,
      timestamp: ts,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();

  console.log('[IPAYMU] Request body:', JSON.stringify(body));
  console.log('[IPAYMU] Response status:', res.status);
  console.log('[IPAYMU] Response body:', JSON.stringify(json));

  if (json.Status !== 200 || !json.Data?.Url) {
    throw new Error(
      `iPaymu payment creation failed (${json.Status}): ${json.Message}`
    );
  }

  return {
    url: json.Data.Url,
    sessionId: json.Data.SessionID,
    referenceId: req.referenceId,
    sandbox: IS_SANDBOX,
  };
}

/**
 * Verifies an iPaymu callback signature. iPaymu signs the sorted callback
 * payload with HMAC-SHA256 using the VA as the key. In sandbox mode we accept
 * the callback without verification so the end-to-end flow can be tested.
 */
export function verifyIpaymuCallback(
  params: Record<string, string>
): boolean {
  if (IS_SANDBOX) return true;

  const signature = params.signature;
  if (!signature) return false;

  const crypto = require('crypto') as typeof import('crypto');
  const clone = { ...params };
  delete clone.signature;

  const sorted = Object.keys(clone)
    .sort()
    .reduce((acc, key) => {
      acc[key] = clone[key];
      return acc;
    }, {} as Record<string, string>);

  const expected = crypto
    .createHmac('sha256', IPAYMU_VA)
    .update(JSON.stringify(sorted))
    .digest('hex');

  return expected === signature;
}

export const ipaymuBaseUrl = BASE_URL;

function sanitizeUrlForIpaymu(url: string): string {
  if (!url) return 'https://example.com';
  try {
    const parsed = new URL(url);
    const isLocalhost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname.startsWith('192.168.') ||
      parsed.hostname.endsWith('.local') ||
      parsed.protocol === 'http:';
    if (isLocalhost) {
      return 'https://example.com';
    }
    return url;
  } catch {
    if (
      url.includes('localhost') ||
      url.includes('127.0.0.1') ||
      url.startsWith('http://')
    ) {
      return 'https://example.com';
    }
    return url;
  }
}

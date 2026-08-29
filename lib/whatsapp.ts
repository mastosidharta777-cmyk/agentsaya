/**
 * Fonnte WhatsApp API integration.
 * Docs: https://api.fonnte.com/send
 *
 * Set FONNTE_TOKEN to enable live sends. Without it, messages are logged and a
 * sandbox flag is returned so the onboarding flow still completes end-to-end.
 */

const FONNTE_URL = 'https://api.fonnte.com/send';
const FONNTE_TOKEN = process.env.FONNTE_TOKEN || '';
const SANDBOX = !FONNTE_TOKEN;

export interface WhatsappMessage {
  target: string;
  message: string;
}

export interface WhatsappResult {
  success: boolean;
  sandbox: boolean;
  error?: string;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  if (digits.startsWith('62')) return digits;
  if (digits.length > 5) return '62' + digits;
  return digits;
}

export async function sendWhatsApp(
  msg: WhatsappMessage
): Promise<WhatsappResult> {
  const target = normalizePhone(msg.target);
  if (SANDBOX) {
    console.info('[WhatsApp sandbox] ->', target);
    console.info(msg.message);
    return { success: true, sandbox: true };
  }

  try {
    const res = await fetch(FONNTE_URL, {
      method: 'POST',
      headers: {
        Authorization: FONNTE_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target,
        message: msg.message,
        countryCode: '62',
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        sandbox: false,
        error: `Fonnte ${res.status}: ${text}`,
      };
    }
    const json = await res.json();
    if (json.status === false || json.r_status === false) {
      return { success: false, sandbox: false, error: JSON.stringify(json) };
    }
    return { success: true, sandbox: false };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, sandbox: false, error: message };
  }
}

export function buildAgentWelcomeMessage(opts: {
  customerName: string;
  agentName: string;
  chatUrl: string;
}): string {
  return [
    `Halo ${opts.customerName}, AI Agent Anda sudah aktif! 🤖`,
    ``,
    `Nama Agent: *${opts.agentName}*`,
    `Langganan aktif selama 30 hari.`,
    ``,
    `🔗 Link chat AI Agent Anda:`,
    `${opts.chatUrl}`,
    ``,
    `Bagikan link ini ke calon pelanggan, atau embed di website Anda.`,
    ``,
    `Butuh bantuan? Balas pesan ini.`,
    `— Tim Agent Saya`,
  ].join('\n');
}

/**
 * Resend email integration.
 * Docs: https://resend.com/api-reference/emails/send-email
 *
 * Set RESEND_API_KEY and RESEND_FROM to enable live sends. Without them, the
 * email body is logged and a sandbox flag is returned.
 */

const RESEND_URL = 'https://api.resend.com/emails';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || 'Agent Saya <noreply@agentsaya.site>';
const SANDBOX = !RESEND_API_KEY;

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailResult {
  success: boolean;
  sandbox: boolean;
  error?: string;
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  if (SANDBOX) {
    console.info('[Email sandbox] ->', msg.to, '|', msg.subject);
    return { success: true, sandbox: true };
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        sandbox: false,
        error: `Resend ${res.status}: ${text}`,
      };
    }
    return { success: true, sandbox: false };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, sandbox: false, error: message };
  }
}

export function buildAgentWelcomeEmail(opts: {
  customerName: string;
  agentName: string;
  chatUrl: string;
  embedCode: string;
  amount: number;
}): string {
  const fmt = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  });
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html>
  <body style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
    <div style="background:#10b981;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;font-size:22px">AI Agent Anda Aktif! 🤖</h1>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 12px 12px">
      <p>Halo ${esc(opts.customerName)},</p>
      <p>AI Agent <strong>${esc(opts.agentName)}</strong> sudah aktif selama 30 hari.</p>
      <table style="width:100%;margin:16px 0;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#64748b">Agent</td><td style="padding:8px 0;text-align:right;font-weight:600">${esc(opts.agentName)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #f1f5f9">Harga</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #f1f5f9">${fmt.format(opts.amount)}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;border-top:1px solid #f1f5f9">Masa aktif</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #f1f5f9">30 hari</td></tr>
      </table>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:16px;border-radius:8px;margin:16px 0">
        <p style="margin:0 0 8px;color:#15803d;font-weight:600">Link chat AI Agent Anda:</p>
        <a href="${opts.chatUrl}" style="color:#15803d;word-break:break-all">${opts.chatUrl}</a>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;padding:16px;border-radius:8px;margin:16px 0">
        <p style="margin:0 0 8px;color:#475569;font-weight:600">Embed code untuk website:</p>
        <pre style="margin:0;white-space:pre-wrap;word-break:break-all;font-size:12px;color:#334155;background:#fff;padding:12px;border-radius:6px;border:1px solid #e2e8f0">${esc(opts.embedCode)}</pre>
      </div>
      <a href="${opts.chatUrl}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;margin:8px 0">Buka AI Agent →</a>
      <p style="color:#64748b;font-size:13px;margin-top:24px">— Tim Agent Saya</p>
    </div>
  </body>
</html>`;
}

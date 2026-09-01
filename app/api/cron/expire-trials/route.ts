import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendEmail, buildTrialReminderEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || '';

interface TrialAgent {
  id: string;
  agent_name: string;
  custom_agent_slug: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  trial_ends_at: string;
}

type ReminderStage = 'h-2' | 'h0' | 'h3' | 'h7';

function getStage(now: Date, trialEndsAt: Date): ReminderStage | null {
  const diffMs = trialEndsAt.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffHours > 0 && diffHours <= 48) return 'h-2';
  if (diffHours <= 0 && diffDays > -1) return 'h0';
  if (diffDays <= -1 && diffDays > -5) return 'h3';
  if (diffDays <= -5 && diffDays > -9) return 'h7';
  return null;
}

function shouldSendToday(
  stage: ReminderStage,
  lastReminderSent: string | null,
  now: Date
): boolean {
  if (!lastReminderSent) return true;
  const last = new Date(lastReminderSent);
  const hoursSinceLast = (now.getTime() - last.getTime()) / (1000 * 60 * 60);
  if (stage === 'h-2') return hoursSinceLast >= 12;
  return hoursSinceLast >= 24;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const stats = {
    expired: 0,
    remindersSent: { 'h-2': 0, h0: 0, h3: 0, h7: 0 },
    errors: 0,
  };

  try {
    const { data: expiredTrials, error: expireError } = await supabaseAdmin
      .rpc('expire_trial');

    if (expireError) {
      console.error('[CRON] expire_trial RPC error:', expireError);
    } else {
      stats.expired = 1;
    }
  } catch (err) {
    console.error('[CRON] Failed to expire trials:', err);
  }

  try {
    const { data: trialAgents, error: queryError } = await supabaseAdmin
      .from('agents')
      .select('id, agent_name, custom_agent_slug, owner_name, owner_email, owner_phone, trial_ends_at, telegram_chat_id, last_trial_reminder_sent, last_trial_reminder_stage')
      .eq('payment_status', 'TRIAL')
      .not('trial_ends_at', 'is', null);

    if (queryError) {
      console.error('[CRON] Query error:', queryError);
      return NextResponse.json({ error: 'Query failed', details: queryError }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.agentsaya.site';

    for (const agent of (trialAgents || []) as Array<TrialAgent & { last_trial_reminder_sent?: string | null; last_trial_reminder_stage?: string | null }>) {
      if (!agent.trial_ends_at) continue;

      const trialEndsAt = new Date(agent.trial_ends_at);
      const stage = getStage(now, trialEndsAt);
      if (!stage) continue;

      if (!shouldSendToday(stage, agent.last_trial_reminder_sent || null, now)) continue;
      if (agent.last_trial_reminder_stage === stage) continue;

      const upgradeUrl = `${baseUrl}/checkout?slug=${agent.custom_agent_slug}&renewal=true`;
      const chatUrl = `${baseUrl}/chat/${agent.custom_agent_slug}`;

      try {
        const emailHtml = buildTrialReminderEmail({
          customerName: agent.owner_name,
          agentName: agent.agent_name,
          stage,
          upgradeUrl,
          chatUrl,
        });

        const subjectMap: Record<ReminderStage, string> = {
          'h-2': '⏰ 2 hari lagi — Trial AI Agent Anda akan berakhir',
          h0: '🔔 Trial AI Agent Anda telah berakhir',
          h3: '🎉 Diskon 50% khusus untuk Anda',
          h7: '👋 Kunjungan terakhir — AI Agent Anda masih menunggu',
        };

        const emailResult = await sendEmail({
          to: agent.owner_email,
          subject: subjectMap[stage],
          html: emailHtml,
        });

        if (emailResult.success) {
          console.log(`[CRON] Sent ${stage} reminder to ${agent.owner_email} for agent ${agent.custom_agent_slug}`);
        } else {
          console.error(`[CRON] Email failed for ${agent.owner_email}:`, emailResult.error);
        }

        await supabaseAdmin
          .from('agents')
          .update({
            last_trial_reminder_sent: now.toISOString(),
            last_trial_reminder_stage: stage,
          })
          .eq('id', agent.id);

        stats.remindersSent[stage]++;
      } catch (err) {
        stats.errors++;
        console.error(`[CRON] Failed to send reminder for agent ${agent.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      stats,
    });
  } catch (err) {
    console.error('[CRON] Fatal error:', err);
    return NextResponse.json(
      { error: 'Internal error', details: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';

/**
 * POST /api/webhook/telegram
 * Handles Telegram bot webhook events including inline keyboard button clicks
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Handle callback query (button clicks)
    if (body.callback_query) {
      const callbackQuery = body.callback_query;
      const callbackData = callbackQuery.data;
      const callbackId = callbackQuery.id;
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;

      // Parse callback data: "approve_{merchantRef}" or "reject_{merchantRef}"
      const [action, merchantRef] = callbackData.split('_');

      if (action === 'approve') {
        // Find the transaction and agent
        const { data: tx, error: txError } = await supabase
          .from('transactions')
          .select('id')
          .eq('merchant_ref', merchantRef)
          .maybeSingle();

        if (txError || !tx) {
          await sendTelegramMessage(
            `❌ Transaction not found for reference: ${merchantRef}`
          );
          
          await fetch(
            `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: callbackId,
                text: 'Transaction not found',
                show_alert: true,
              }),
            }
          );

          return NextResponse.json({ success: false, error: 'Transaction not found' });
        }

        const { data: agent, error: agentError } = await supabase
          .from('agents')
          .select('id, agent_name')
          .eq('transaction_id', tx.id)
          .maybeSingle();

        if (agentError || !agent) {
          await sendTelegramMessage(
            `❌ Agent not found for transaction: ${merchantRef}`
          );
          
          await fetch(
            `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: callbackId,
                text: 'Agent not found',
                show_alert: true,
              }),
            }
          );

          return NextResponse.json({ success: false, error: 'Agent not found' });
        }

        // Activate the agent
        const { error: activateError } = await supabase
          .rpc('activate_agent', {
            p_merchant_ref: merchantRef,
            p_reference: merchantRef,
          });

        if (activateError) {
          // Send error message
          await sendTelegramMessage(
            `❌ Failed to activate agent: ${activateError.message}`
          );
          
          // Answer callback query
          await fetch(
            `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: callbackId,
                text: 'Failed to activate agent',
                show_alert: true,
              }),
            }
          );

          return NextResponse.json({ success: false, error: activateError.message });
        }

        // Send success message
        await sendTelegramMessage(
          `✅ Agent ${agent.agent_name} has been manually activated`
        );

        // Update the original message
        await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/editMessageText`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: `✅ *Agent Activated*\n\nAgent ${agent.agent_name} has been manually approved and activated.`,
              parse_mode: 'Markdown',
            }),
          }
        );

        // Answer callback query
        await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: callbackId,
              text: 'Agent activated successfully',
            }),
          }
        );

        return NextResponse.json({ success: true, action: 'approved', merchantRef });
      } else if (action === 'reject') {
        // Reject the payment
        await sendTelegramMessage(
          `❌ Payment for ${merchantRef} has been rejected`
        );

        // Update the original message
        await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/editMessageText`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: `❌ *Payment Rejected*\n\nPayment for ${merchantRef} has been rejected.`,
              parse_mode: 'Markdown',
            }),
          }
        );

        // Answer callback query
        await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: callbackId,
              text: 'Payment rejected',
            }),
          }
        );

        return NextResponse.json({ success: true, action: 'rejected', merchantRef });
      } else {
        // Unknown action
        await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: callbackId,
              text: 'Unknown action',
              show_alert: true,
            }),
          }
        );

        return NextResponse.json({ success: false, error: 'Unknown action' });
      }
    }

    // Handle regular messages (optional - for debugging or admin commands)
    if (body.message) {
      const message = body.message;
      const chatId = message.chat.id;
      const text = message.text;

      if (text === '/start') {
        await sendTelegramMessage(
          '🤖 AgentKu Payment Bot\n\n' +
          'I handle payment verification notifications. ' +
          'When a user uploads a receipt, I will notify you here for manual review if needed.'
        );
      } else if (text === '/help') {
        await sendTelegramMessage(
          'Available commands:\n' +
          '/start - Start the bot\n' +
          '/help - Show this help message'
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Telegram webhook error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
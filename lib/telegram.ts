/**
 * Telegram Bot integration for payment verification notifications
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

export interface TelegramMessageOptions {
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  replyMarkup?: string;
}

/**
 * Sends a text message to Telegram to a specific chat ID
 */
export async function sendTelegramMessageToChat(
  chatId: string,
  text: string,
  options: TelegramMessageOptions = {}
): Promise<{ success: boolean; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('Telegram bot token not configured, skipping notification');
    return { success: false, error: 'Telegram not configured' };
  }

  if (!chatId) {
    return { success: false, error: 'Chat ID not provided' };
  }

  try {
    const { parseMode = 'Markdown' } = options;
    const body = {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    };

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram sendMessage error: ${errorText}`);
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Telegram error:', message);
    return { success: false, error: message };
  }
}

/**
 * Sends a text message to Telegram
 */
export async function sendTelegramMessage(
  text: string,
  photoBase64?: string,
  options: TelegramMessageOptions = {}
): Promise<{ success: boolean; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('Telegram credentials not configured, skipping notification');
    return { success: false, error: 'Telegram not configured' };
  }

  try {
    const { parseMode = 'Markdown', replyMarkup } = options;

    if (photoBase64) {
      // Send photo with caption
      const formData = new FormData();
      formData.append('chat_id', TELEGRAM_CHAT_ID);
      
      // Convert base64 to File
      const photoBuffer = Buffer.from(photoBase64, 'base64');
      const photoFile = new File([photoBuffer], 'receipt.jpg', { type: 'image/jpeg' });
      
      formData.append('photo', photoFile);
      formData.append('caption', text);
      formData.append('parse_mode', parseMode);

      if (replyMarkup) {
        formData.append('reply_markup', replyMarkup);
      }

      const response = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Telegram sendPhoto error: ${errorText}`);
      }

      return { success: true };
    } else {
      // Send text message
      const body = {
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: parseMode,
        ...(replyMarkup && { reply_markup: replyMarkup }),
      };

      const response = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Telegram sendMessage error: ${errorText}`);
      }

      return { success: true };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Telegram error:', message);
    return { success: false, error: message };
  }
}

/**
 * Creates an inline keyboard for manual approval
 */
export function createApprovalKeyboard(merchantRef: string): string {
  return JSON.stringify({
    inline_keyboard: [
      [
        {
          text: '✅ Aktifkan Manual',
          callback_data: `approve_${merchantRef}`,
        },
      ],
      [
        {
          text: '❌ Tolak',
          callback_data: `reject_${merchantRef}`,
        },
      ],
    ],
  });
}

/**
 * Sends a payment verification request with approval buttons
 */
export async function sendVerificationRequest(
  merchantRef: string,
  userName: string,
  agentName: string,
  amount: number,
  ocrResult: string,
  photoBase64?: string
): Promise<{ success: boolean; error?: string }> {
  const message =
    `📋 *Payment Verification Required*\n\n` +
    `User: ${userName}\n` +
    `Agent: ${agentName}\n` +
    `Amount: Rp ${amount.toLocaleString('id-ID')}\n` +
    `OCR Result:\n${ocrResult}\n\n` +
    `Please review and approve or reject.`;

  return sendTelegramMessage(
    message,
    photoBase64,
    {
      parseMode: 'Markdown',
      replyMarkup: createApprovalKeyboard(merchantRef),
    }
  );
}
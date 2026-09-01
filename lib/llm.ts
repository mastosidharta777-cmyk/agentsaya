/**
 * LLM completion integration with multi-provider fallback.
 *
 * Primary: OpenRouter (openrouter/free)
 * Fallback: Groq (openai/gpt-oss-20b, groq/compound-mini)
 * 
 * Supports automatic fallback to alternative providers if the primary fails.
 * Without API keys, a sandbox responder echoes the knowledge base back so the chat UI
 * is fully functional for demos. The keys are server-side only — never exposed to the browser.
 */

import OpenAI from 'openai';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const SAMBANOVA_API_KEY = process.env.SAMBANOVA_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Check API keys at startup
console.log('[LLM INIT] GROQ_API_KEY:', GROQ_API_KEY ? '✓ Set' : '✗ Not set');
console.log('[LLM INIT] OPENROUTER_API_KEY:', OPENROUTER_API_KEY ? '✓ Set' : '✗ Not set');
console.log('[LLM INIT] SAMBANOVA_API_KEY:', SAMBANOVA_API_KEY ? '✓ Set' : '✗ Not set');
console.log('[LLM INIT] OPENAI_API_KEY:', OPENAI_API_KEY ? '✓ Set' : '✗ Not set');

if (!OPENROUTER_API_KEY) {
  console.warn('[LLM INIT] ⚠️  WARNING: OPENROUTER_API_KEY not found in environment. Fallback to OpenRouter will not work.');
}
if (!SAMBANOVA_API_KEY) {
  console.warn('[LLM INIT] ⚠️  WARNING: SAMBANOVA_API_KEY not found in environment. Fallback to SambaNova will not work.');
}
if (!OPENAI_API_KEY) {
  console.warn('[LLM INIT] ⚠️  WARNING: OPENAI_API_KEY not found in environment. Fallback to OpenAI will not work.');
}

const SANDBOX = !GROQ_API_KEY && !OPENROUTER_API_KEY && !SAMBANOVA_API_KEY && !OPENAI_API_KEY;

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENROUTER_MODELS = [
  'openrouter/free',
];
const SAMBANOVA_MODELS = [
  'Meta-Llama-3.3-70B-Instruct',
  'Qwen2.5-72B-Instruct',
  'DeepSeek-R1-Distill-Llama-70B',
];

const GROQ_FALLBACK_MODELS = [
  'openai/gpt-oss-20b',
  'groq/compound-mini',
];

const groq = GROQ_API_KEY ? new OpenAI({
  apiKey: GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
  defaultHeaders: {
    'Authorization': `Bearer ${GROQ_API_KEY}`,
  },
}) : null;
const openrouter = OPENROUTER_API_KEY ? new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'Agent Saya',
  },
}) : null;
const sambanova = SAMBANOVA_API_KEY ? new OpenAI({
  apiKey: SAMBANOVA_API_KEY,
  baseURL: 'https://api.sambanova.ai/v1',
}) : null;
const openai = OPENAI_API_KEY ? new OpenAI({
  apiKey: OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
}) : null;

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  systemPrompt: string;
  history: ChatTurn[];
  userMessage: string;
  knowledgeBase: string;
}

export interface LlmResult {
  reply: string;
  sandbox: boolean;
}

const MAX_HISTORY = 8;

function sandboxReply(userMessage: string, knowledgeBase: string): string {
  const lower = userMessage.toLowerCase();
  // naive keyword search into the knowledge base
  const lines = knowledgeBase.split('\n').filter((l) => l.trim());
  const match = lines.find((l) =>
    lower
      .split(/\s+/)
      .some((w) => w.length > 3 && l.toLowerCase().includes(w))
  );
  if (match) {
    return `Berdasarkan informasi kami: ${match.trim()}\n\n(Demo mode — set GROQ_API_KEY untuk jawaban AI penuh.)`;
  }
  return `Terima kasih atas pertanyaan Anda. Saat ini saya berjalan dalam mode demo. Dengan API key Groq, saya bisa menjawab berdasarkan knowledge base lengkap bisnis ini.\n\nCoba tanyakan tentang produk, harga, atau info yang ada di deskripsi bisnis.`;
}

async function tryGroq(messages: any[]): Promise<string> {
  if (!groq) {
    console.log('[Groq] Not configured, skipping');
    throw new Error('Groq not configured');
  }

  let lastError: Error | null = null;
  const modelsToTry = [GROQ_MODEL, ...GROQ_FALLBACK_MODELS.filter(m => m !== GROQ_MODEL)];

  const groqMessages = messages.map((msg) => {
    if (msg.role === 'system') {
      const truncated = msg.content.length > 15000 ? msg.content.substring(0, 15000) : msg.content;
      return { ...msg, content: truncated };
    }
    return msg;
  });

  for (const model of modelsToTry) {
    try {
      console.log(`[Groq] Attempting model: ${model}`);
      const completion = await groq.chat.completions.create({
        model: model,
        messages: groqMessages,
        max_tokens: 4000,
        temperature: 0.0,
      });

      const reply = completion.choices?.[0]?.message?.content?.trim() ||
        'Maaf, saya tidak bisa menjawab saat ini. Silakan coba lagi.';
      
      console.log(`[Groq] Success with model ${model}, reply length:`, reply.length);
      return reply;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error('LLM error');
      console.error(`[Groq] Model ${model} failed:`, lastError.message);
      if (lastError.message.includes('429') || lastError.message.includes('rate limit') || 
          lastError.message.includes('overloaded') || lastError.message.includes('high demand')) {
        console.log('[Groq] High demand/rate limit detected, will try next model');
      }
    }
  }

  console.log('[LLM FALLBACK] Groq gagal/overloaded. Mengalihkan ke OpenRouter...');
  throw lastError || new Error('All Groq models failed');
}

async function tryOpenRouter(messages: any[]): Promise<string> {
  if (!openrouter) {
    console.log('[OpenRouter] Not configured, skipping');
    console.log('[LLM FALLBACK] OpenRouter tidak tersedia. Mengalihkan ke SambaNova...');
    throw new Error('OpenRouter not configured');
  }

  let lastError: Error | null = null;

  for (const model of OPENROUTER_MODELS) {
    try {
      console.log(`[OpenRouter] Attempting model: ${model}`);
      console.log(`[OpenRouter] Using API key: ${OPENROUTER_API_KEY ? '✓ Set' : '✗ Not set'}`);
      
      const completion = await openrouter.chat.completions.create({
        model: model,
        messages: messages,
        max_tokens: 4000,
        temperature: 0.0,
      });

      const reply = completion.choices?.[0]?.message?.content?.trim() ||
        'Maaf, saya tidak bisa menjawab saat ini. Silakan coba lagi.';
      
      console.log(`[OpenRouter] Success, reply length:`, reply.length);
      return reply;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error('LLM error');
      console.error(`[OpenRouter] Model ${model} failed:`, lastError.message);
      if (lastError.message.includes('401') || lastError.message.includes('authentication') || lastError.message.includes('API key')) {
        console.error('[OpenRouter] Authentication error - check API key');
      }
      console.log('[LLM FALLBACK] OpenRouter model gagal. Mencoba model berikutnya...');
    }
  }

  console.log('[LLM FALLBACK] Semua model OpenRouter gagal. Mengalihkan ke SambaNova...');
  throw lastError || new Error('All OpenRouter models failed');
}

async function trySambaNova(messages: any[]): Promise<string> {
  if (!sambanova) {
    console.log('[SambaNova] Not configured, skipping');
    throw new Error('SambaNova not configured');
  }

  let lastError: Error | null = null;

  for (const model of SAMBANOVA_MODELS) {
    try {
      console.log(`[SambaNova] Attempting model: ${model}`);
      console.log(`[SambaNova] Using API key: ${SAMBANOVA_API_KEY ? '✓ Set' : '✗ Not set'}`);
      
      const completion = await sambanova.chat.completions.create({
        model: model,
        messages: messages,
        max_tokens: 4000,
        temperature: 0.0,
      });

      const reply = completion.choices?.[0]?.message?.content?.trim() ||
        'Maaf, saya tidak bisa menjawab saat ini. Silakan coba lagi.';
      
      console.log(`[SambaNova] Success, reply length:`, reply.length);
      return reply;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error('LLM error');
      console.error(`[SambaNova] Model ${model} failed:`, lastError.message);
      if (lastError.message.includes('401') || lastError.message.includes('authentication') || lastError.message.includes('API key')) {
        console.error('[SambaNova] Authentication error - check API key');
      }
      console.log('[LLM FALLBACK] SambaNova model gagal. Mencoba model berikutnya...');
    }
  }

  console.log('[LLM FALLBACK] Semua model SambaNova gagal. Mengalihkan ke OpenAI...');
  throw lastError || new Error('All SambaNova models failed');
}

async function tryOpenAI(messages: any[]): Promise<string> {
  if (!openai) {
    console.log('[OpenAI] Not configured, skipping');
    throw new Error('OpenAI not configured');
  }

  try {
    console.log(`[OpenAI] Attempting model: ${OPENAI_MODEL}`);
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: messages,
      max_tokens: 4000,
      temperature: 0.0,
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() ||
      'Maaf, saya tidak bisa menjawab saat ini. Silakan coba lagi.';

    console.log(`[OpenAI] Success, reply length:`, reply.length);
    return reply;
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error('LLM error');
    console.error(`[OpenAI] Model ${OPENAI_MODEL} failed:`, error.message);
    if (error.message.includes('401') || error.message.includes('authentication') || error.message.includes('API key')) {
      console.error('[OpenAI] Authentication error - check API key');
    } else if (error.message.includes('429') || error.message.includes('rate limit') || error.message.includes('quota')) {
      console.error('[OpenAI] Rate limit / quota exceeded');
    }
    throw error;
  }
}

/**
 * Cleans raw PDF/OCR extracted text using LLM.
 * Restructures into clean Markdown tables, removes duplicates, fixes formatting.
 */
export async function cleanKnowledgeBaseWithLLM(rawText: string): Promise<string> {
  if (SANDBOX || !rawText || rawText.trim().length === 0) {
    return rawText;
  }

  const cleaningPrompt = `Kamu adalah asisten pembersih teks ekstraksi dokumen. Ubah teks berikut menjadi data terstruktur dalam format Markdown Table yang rapi dan mudah dibaca.

ATURAN WAJIB:
1. Hapus teks duplikat, baris kosong, artefak OCR, dan karakter aneh.
2. Pastikan baris dan kolom tabel harga tidak tertukar.
3. Format angka harga dengan rapih (contoh: Rp 4.097.010.000).
4. Jangan menambahkan informasi yang tidak ada di teks asli.
5. Jika ada unit dengan tipe dan harga sama, gabungkan menjadi 1 baris.
6. Kelompokkan berdasarkan tipe/ukuran unit.
7. Gunakan kapitalisasi yang benar untuk nama unit (contoh: "Ruko 5", BUKAN "RUko 5").
8. Hanya kembalikan data yang sudah bersih, tanpa penjelasan tambahan.`;

  const messages = [
    { role: 'system', content: cleaningPrompt },
    { role: 'user', content: rawText },
  ];

  const providers: Array<{ name: string; fn: () => Promise<string> }> = [];

  if (openrouter) {
    providers.push({ name: 'OpenRouter', fn: () => tryOpenRouter(messages) });
  }
  if (groq) {
    providers.push({ name: 'Groq', fn: () => tryGroq(messages) });
  }
  if (sambanova) {
    providers.push({ name: 'SambaNova', fn: () => trySambaNova(messages) });
  }
  if (openai) {
    providers.push({ name: 'OpenAI', fn: () => tryOpenAI(messages) });
  }

  if (providers.length === 0) {
    return rawText;
  }

  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      console.log(`[KB CLEAN] Trying provider: ${provider.name}`);
      const cleaned = await provider.fn();
      console.log(`[KB CLEAN] Provider ${provider.name} succeeded, cleaned length:`, cleaned.length);
      return cleaned;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error('LLM error');
      console.error(`[KB CLEAN] Provider ${provider.name} failed:`, lastError.message);
    }
  }

  console.error('[KB CLEAN] All providers failed. Returning raw text.');
  return rawText;
}

export async function chatComplete(req: LlmRequest): Promise<LlmResult> {
  if (SANDBOX) {
    // simulate latency
    await new Promise((r) => setTimeout(r, 600));
    return {
      reply: sandboxReply(req.userMessage, req.knowledgeBase),
      sandbox: true,
    };
  }

  // Ensure knowledge base is included in system prompt
  const fullSystemPrompt = req.systemPrompt;
  
  // Log for debugging
  console.log('=== CHAT COMPLETION ===');
  console.log('System prompt length:', fullSystemPrompt.length);
  console.log('Knowledge base length:', req.knowledgeBase.length);
  console.log('Knowledge base preview:', req.knowledgeBase.substring(0, 200) + '...');
  console.log('User message:', req.userMessage);
  console.log('History length:', req.history.length);

  const messages = [
    { role: 'system', content: fullSystemPrompt },
    ...req.history.slice(-MAX_HISTORY),
    { role: 'user', content: req.userMessage },
  ];

  // Multi-provider fallback hierarchy
  const providers: Array<{ name: string; fn: () => Promise<string> }> = [];

  if (openrouter) {
    providers.push({ name: 'OpenRouter', fn: () => tryOpenRouter(messages) });
  }
  if (groq) {
    providers.push({ name: 'Groq', fn: () => tryGroq(messages) });
  }
  if (sambanova) {
    providers.push({ name: 'SambaNova', fn: () => trySambaNova(messages) });
  }
  if (openai) {
    providers.push({ name: 'OpenAI', fn: () => tryOpenAI(messages) });
  }

  if (providers.length === 0) {
    return {
      reply: sandboxReply(req.userMessage, req.knowledgeBase),
      sandbox: true,
    };
  }

  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      console.log(`[Main] Trying provider: ${provider.name}`);
      const reply = await provider.fn();
      console.log(`[Main] Provider ${provider.name} succeeded`);
      return { reply, sandbox: false };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error('LLM error');
      console.error(`[Main] Provider ${provider.name} failed:`, lastError.message);
      // Continue to next provider - DO NOT throw, continue fallback
    }
  }

  // All providers failed - return generic error to user
  console.error('[Main] All providers failed. Last error:', lastError?.message);
  return {
    reply: 'Maaf, server AI sedang padat saat ini. Silakan coba kirim ulang pesan Anda beberapa saat lagi.',
    sandbox: false,
  };
}

export const isLlmSandbox = SANDBOX;

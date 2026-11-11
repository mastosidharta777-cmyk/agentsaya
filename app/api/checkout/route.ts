import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { BASIC_PLAN, TRIAL_PLAN, YEARLY_PLAN, formatRupiah } from '@/lib/plans';
import { slugify, randomSuffix, buildSystemPrompt, generateReferralCode } from '@/lib/agents';
import { createAgentSayaPayment, requireMayarConfigured, isMayarSandbox } from '@/lib/mayar';
import { randomUUID } from 'crypto';
import { extractText } from 'unpdf';
import { cleanKnowledgeBaseWithLLM } from '@/lib/llm';

const cleanPayloadText = (str: string) => {
  if (!str) return '';
  return str
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};


const TRIAL_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function computeNewPeriodEnd(existingPeriodEnd: string | null | undefined, periodDays: number): string {
  const nowMs = Date.now();
  const baseMs = existingPeriodEnd ? new Date(existingPeriodEnd).getTime() : nowMs;
  const startMs = Math.max(baseMs, nowMs);
  return new Date(startMs + periodDays * MS_PER_DAY).toISOString();
}


async function extractTextFromPDF(data: Uint8Array): Promise<string> {
  try {
    console.log('[CHECKOUT PDF EXTRACT] Input data length:', data.length);
    const { text, totalPages } = await extractText(data);
    console.log('[CHECKOUT PDF EXTRACT] totalPages:', totalPages, 'text type:', typeof text, 'isArray:', Array.isArray(text));
    const fullText = Array.isArray(text) ? text.join('\n') : String(text || '');
    const cleanText = fullText.trim();
    console.log('[CHECKOUT PDF EXTRACT] Result length (trimmed):', cleanText.length);
    return cleanText;
  } catch (error) {
    console.error('[CHECKOUT PDF EXTRACTION] Error extracting text from PDF:', error);
    return '';
  }
}

async function ocrSpaceText(data: Uint8Array, mimeType: string): Promise<string> {
  try {
    const apiKey = process.env.OCR_SPACE_API_KEY;
    if (!apiKey) {
      console.warn('[OCR] OCR_SPACE_API_KEY tidak ditemukan, lewati OCR');
      return '';
    }

    console.log('[OCR] Calling OCR.space for mimeType:', mimeType, 'data length:', data.length);

    const blob = new Blob([data], { type: mimeType });
    const formData = new FormData();
    formData.append('file', blob, 'upload.' + mimeType.split('/')[1]);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('ocrengine', '2');

    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        apikey: apiKey,
      },
      body: formData,
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('[OCR] OCR.space request failed with status:', res.status, 'detail:', detail);
      return '';
    }

    const raw = await res.text();
    console.log('[OCR] OCR.space raw response:', raw.substring(0, 500));

    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      console.error('[OCR] Gagal parse JSON respons OCR.space');
      return '';
    }

    if (json.IsErroredOnProcessing) {
      console.error('[OCR] OCR.space reported error:', json.ErrorMessage);
      return '';
    }

    const parsedResults = json.ParsedResults;
    if (!parsedResults || parsedResults.length === 0) {
      console.warn('[OCR] No parsed results from OCR.space');
      return '';
    }

    const ocrText = parsedResults[0].ParsedText || '';
    console.log('[OCR] Extracted text length:', ocrText.length);
    return ocrText;
  } catch (error) {
    console.error('[OCR] Error during OCR processing:', error);
    return '';
  }
}

export async function POST(req: NextRequest) {
  let slug: string = '';
  let slugFromForm: string = '';
  console.log('[CHECKOUT] Request received');
  try {
    const contentType = req.headers.get('content-type') || '';
    console.log('[CHECKOUT] Content-Type:', contentType);
    
    let agentName: string = '';
    let knowledgeBase: string = '';
    let welcomeMessage: string = '';
    let name: string = '';
    let email: string = '';
    let phone: string = '';
    let telegramChatId: string = '';
    let referralCode: string = '';
    let planType: 'trial' | 'monthly' | 'yearly' = 'monthly';
    let pdfText: string = '';
    let additionalNotes: string = '';
    let renewal = false;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      
      agentName = formData.get('agentName') as string || '';
      knowledgeBase = formData.get('knowledgeBase') as string || '';
      welcomeMessage = formData.get('welcomeMessage') as string || '';
      name = formData.get('name') as string || '';
      email = formData.get('email') as string || '';
      phone = formData.get('phone') as string || '';
      telegramChatId = formData.get('telegramChatId') as string || '';
      referralCode = formData.get('referralCode') as string || '';
      planType = (formData.get('planType') as string) as 'trial' | 'monthly' | 'yearly' || 'monthly';
      additionalNotes = formData.get('additionalNotes') as string || '';
      renewal = formData.get('renewal') === 'true';
      slugFromForm = formData.get('slug') as string || '';
      
      const pdfFile = formData.get('pdfFile') as File | null;
      
      if (planType !== 'trial' && pdfFile) {
        console.log('[CHECKOUT PDF] Apakah pdfFile ada?', !!pdfFile);
        console.log('[CHECKOUT PDF] Nama File:', pdfFile.name, 'Ukuran:', pdfFile.size, 'Tipe:', pdfFile.type);

        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        if (pdfFile.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            { error: 'Ukuran file terlalu besar. Maksimal 10MB.' },
            { status: 400 }
          );
        }

        const fileType = pdfFile.type;
        const isImage = fileType.startsWith('image/');
        const isPdf = fileType === 'application/pdf';

        if (!isImage && !isPdf) {
          return NextResponse.json(
            { error: 'File harus berupa PDF atau gambar (PNG/JPG/JPEG/WebP).' },
            { status: 400 }
          );
        }

        if (isPdf || isImage) {
          try {
            const openRouterKey = process.env.OPENROUTER_API_KEY;
            if (!openRouterKey) {
              throw new Error('OPENROUTER_API_KEY tidak ditemukan di file .env.local');
            }

            if (isImage) {
              const arrayBuffer = await pdfFile.arrayBuffer();
              const base64Data = Buffer.from(arrayBuffer).toString('base64');
              const dataUrl = 'data:' + fileType + ';base64,' + base64Data;

              const visionPayload = {
                model: 'openai/gpt-4o-mini',
                messages: [
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'text',
                        text: 'Ekstrak SELURUH data tabel, harga, ukuran, dan teks dari dokumen ini menjadi Clean Markdown Table. Pastikan semua angka, titik harga, dan koma ukuran terbaca 100% utuh tanpa ada karakter yang terpotong.',
                      },
                      {
                        type: 'image_url',
                        image_url: { url: dataUrl },
                      },
                    ],
                  },
                ],
              };

              console.log('[CHECKOUT OPENROUTER] POST https://openrouter.ai/api/v1/chat/completions');
              console.log('[CHECKOUT OPENROUTER] Vision payload:', JSON.stringify(visionPayload).substring(0, 500));

              const visionResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': 'Bearer ' + openRouterKey,
                  'Content-Type': 'application/json',
                  'HTTP-Referer': 'http://localhost:3000',
                  'X-Title': 'Agent Saya',
                },
                body: JSON.stringify(visionPayload),
              });

              const visionResult = await visionResponse.json();

              if (!visionResponse.ok) {
                console.error('[CHECKOUT OPENROUTER ERROR RESPONSE]:', JSON.stringify(visionResult));
                throw new Error(visionResult.error?.message || 'Gagal memproses file via OpenRouter API');
              }

              pdfText = visionResult.choices?.[0]?.message?.content || '';

              if (!pdfText || pdfText.trim().length < 10) {
                console.error('[CHECKOUT OPENROUTER EMPTY CONTENT]:', JSON.stringify(visionResult));
                throw new Error('OpenRouter tidak mengembalikan teks ekstraksi.');
              }
            } else if (isPdf) {
              const arrayBuffer = await pdfFile.arrayBuffer();
              const unpdfCopy = new Uint8Array(arrayBuffer.slice(0));
              const rawTextFromUnpdf = await extractTextFromPDF(unpdfCopy);
              console.log('[CHECKOUT PDF] Raw text length from unpdf:', rawTextFromUnpdf ? rawTextFromUnpdf.length : 0);

              let rawText = rawTextFromUnpdf || '';

              if (!rawText || rawText.trim().length < 20) {
                console.log('[CHECKOUT PDF] Text too short, falling back to OCR.space');
                const ocrText = await ocrSpaceText(new Uint8Array(arrayBuffer.slice(0)), 'application/pdf');
                rawText = ocrText || '';
                console.log('[CHECKOUT PDF] Raw text length from OCR:', rawText ? rawText.length : 0);
              }

              if (!rawText || rawText.trim().length === 0) {
                console.warn('[CHECKOUT PDF] PDF extraction returned empty text. Skipping PDF and continuing with manual knowledge base only.');
                pdfText = '';
              } else {
                const completionPayload = {
                  model: 'openai/gpt-4o-mini',
                  messages: [
                    {
                      role: 'user',
                      content: [
                        {
                          type: 'text',
                          text: 'Susun ulang teks dari PDF price list ini menjadi Clean Markdown Table yang rapi. DILARANG memotong, mengubah, atau menghilangkan angka harga dan ukuran.\n\n--- TEKS PDF ---\n\n' + rawText,
                        },
                      ],
                    },
                  ],
                };

                console.log('[CHECKOUT OPENROUTER] POST https://openrouter.ai/api/v1/chat/completions');
                console.log('[CHECKOUT OPENROUTER] PDF cleaning payload:', JSON.stringify(completionPayload).substring(0, 500));

                const completionResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Bearer ' + openRouterKey,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'Agent Saya',
                  },
                  body: JSON.stringify(completionPayload),
                });

                const completionResult = await completionResponse.json();

                if (!completionResponse.ok) {
                  console.error('[CHECKOUT OPENROUTER TEXT CLEAN ERROR RESPONSE]:', JSON.stringify(completionResult));
                  throw new Error(completionResult.error?.message || 'Gagal memproses teks PDF via OpenRouter API');
                }

                pdfText = completionResult.choices?.[0]?.message?.content || rawText;

                if (!pdfText || pdfText.trim().length < 10) {
                  console.error('[CHECKOUT OPENROUTER TEXT CLEAN EMPTY CONTENT]:', JSON.stringify(completionResult));
                  throw new Error('OpenRouter tidak mengembalikan teks hasil perapihan.');
                }
              }
            }
          } catch (pdfError) {
            console.warn('[CHECKOUT PDF] PDF processing failed, continuing with manual knowledge base only:', pdfError);
            pdfText = '';
          }
        }
      }
    } else {
      const body = await req.json();
      
      agentName = body.agentName || '';
      knowledgeBase = body.knowledgeBase || '';
      welcomeMessage = body.welcomeMessage || '';
      name = body.name || '';
      email = body.email || '';
      phone = body.phone || '';
      referralCode = body.referralCode || '';
      planType = body.planType || 'monthly';
      slugFromForm = body.slug || '';
      pdfText = body.pdfText || '';
    }

    console.log('[CHECKOUT] Parsed fields:', { agentName: !!agentName, email: !!email, phone: !!phone, planType, renewal, slugFromForm: !!slugFromForm, pdfText: !!pdfText });

    if (!slug && slugFromForm) {
      slug = slugFromForm;
      console.log('[CHECKOUT] Using slug from request body:', slug);
    }

    if (!agentName || !name || !email || !phone) {
      return NextResponse.json(
        { error: 'agentName, name, email, and phone are required.' },
        { status: 400 }
      );
    }

    const manualKnowledgeBase = knowledgeBase?.trim() || '';
    const welcome = welcomeMessage?.trim() || `Halo! Saya Asisten Virtual (${agentName}). Ada yang bisa saya bantu hari ini?`;
    const safeWelcomeMessage = welcome || '';
    
    let combinedKnowledgeBase = manualKnowledgeBase;
    if (pdfText && pdfText.length > 0) {
      if (combinedKnowledgeBase.length > 0) {
        combinedKnowledgeBase += '\n\n--- ISI DOKUMEN PDF ---\n\n' + pdfText;
      } else {
        combinedKnowledgeBase = pdfText;
      }
      console.log('[KNOWLEDGE BASE] Combined PDF text with manual input. Total length:', combinedKnowledgeBase.length);
    }
    
    const safeKnowledgeBaseFinal = cleanPayloadText(combinedKnowledgeBase || '');
    
    let systemPrompt = '';
    try {
      systemPrompt = cleanPayloadText(buildSystemPrompt({
        agentName: agentName,
        knowledgeBase: safeKnowledgeBaseFinal,
        ownerName: name,
        ownerPhone: phone,
        additionalNotes: additionalNotes,
      }));
      console.log('[CHECKOUT] System prompt built successfully. Length:', systemPrompt.length);
    } catch (promptErr) {
      console.warn('[CHECKOUT] buildSystemPrompt failed, using fallback prompt:', promptErr);
      systemPrompt = cleanPayloadText(`Kamu adalah asisten virtual untuk ${agentName}. Jawab pertanyaan pelanggan berdasarkan knowledge base yang tersedia. Jika tidak tahu, katakan bahwa informasi belum tersedia dan arahkan untuk menghubungi owner.`);
    }

    let referredByAgentId: string | null = null;
    if (referralCode) {
      try {
        const { data: referrer, error: referrerError } = await supabaseAdmin
          .from('agents')
          .select('id')
          .eq('referral_code', referralCode)
          .eq('payment_status', 'PAID')
          .maybeSingle();
        
        if (referrerError) {
          console.error('[CHECKOUT] Referral lookup error:', referrerError);
        }
        
        if (referrer) {
          referredByAgentId = referrer.id;
        }
      } catch (err) {
        console.error('[CHECKOUT] Referral lookup exception:', err);
      }
    }

    if (!slug) {
      slug = slugify(agentName) || 'agent';
      try {
        for (let attempt = 0; attempt < 5; attempt++) {
          const { data: existing, error: slugError } = await supabaseAdmin
            .from('agents')
            .select('custom_agent_slug')
            .eq('custom_agent_slug', slug)
            .maybeSingle();
          
          if (existing) {
            slug = slugify(agentName) + '-' + randomSuffix(4);
          } else {
            break;
          }
        }
      } catch (slugError) {
        console.error('[CHECKOUT] Slug generation error:', slugError);
        slug = slugify(agentName) + '-' + randomSuffix(4);
      }
    }

    const referralCodeGenerated = generateReferralCode();
    
    const getPlanAmount = (plan: string) => {
      if (plan === 'trial') return 0;
      if (plan === 'yearly') return YEARLY_PLAN.priceMonthly;
      return BASIC_PLAN.priceMonthly;
    };
    
    const getPlanPeriodDays = (plan: string) => {
      if (plan === 'trial') return 3;
      if (plan === 'yearly') return 365;
      return 30;
    };
    
    const getPlanPackageId = (plan: string) => {
      if (plan === 'trial') return TRIAL_PLAN.id;
      if (plan === 'yearly') return YEARLY_PLAN.id;
      return BASIC_PLAN.id;
    };
    
    const amount = getPlanAmount(planType);
    const planPeriodDays = getPlanPeriodDays(planType);
    const planPackageId = getPlanPackageId(planType);

    if (!['trial', 'monthly', 'yearly'].includes(planType) ||
        (renewal && planType === 'trial')) {
      return NextResponse.json({ error: 'Paket tidak valid.' }, { status: 400 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Konfigurasi database server belum siap.' }, { status: 503 });
    }
    const isRenewal = renewal && !!slugFromForm;
    let agentId: string | null = null;
    let redirectUrl: string | null = null;
    let paymentIsSandbox = true;

    if (!isRenewal && planType !== 'trial') {
      const { data: existing } = await supabaseAdmin
        .from('agents').select('id,agent_name,custom_agent_slug,payment_status,period_end,trial_ends_at')
        .eq('owner_email', email.trim().toLowerCase())
        .in('payment_status', ['PAID', 'TRIAL']).limit(1).maybeSingle();
      if (existing) {
        const expiry = existing.payment_status === 'TRIAL' ? existing.trial_ends_at : existing.period_end;
        if (expiry && new Date(expiry) > new Date()) {
          return NextResponse.json({
            error: 'Anda sudah memiliki AI Agent aktif. Silakan gunakan dashboard.',
            dashboardUrl: '/dashboard',
            upgradeUrl: '/checkout?slug=' + encodeURIComponent(existing.custom_agent_slug) + '&renewal=true',
          }, { status: 409 });
        }
      }
    }

    if (planType === 'trial' && !isRenewal) {
      const { data: past } = await supabaseAdmin.from('agents')
        .select('id,trial_ends_at').eq('owner_email', email.trim().toLowerCase())
        .eq('plan_tier','trial').limit(1).maybeSingle();
      if (past) {
        return NextResponse.json({
          error: 'Free trial sudah pernah digunakan. Pilih paket berbayar untuk melanjutkan.'
        }, { status: 409 });
      }
      const trialRef = 'TRIAL-' + randomUUID();
      const { data: agent, error: agentErr } = await supabaseAdmin.from('agents').insert({
        agent_name: agentName, knowledge_base: safeKnowledgeBaseFinal,
        system_prompt: systemPrompt, welcome_message: safeWelcomeMessage,
        custom_agent_slug: slug, payment_status: 'TRIAL',
        owner_name: name, owner_email: email.trim().toLowerCase(), owner_phone: phone,
        telegram_chat_id: telegramChatId || null,
        plan_tier: 'trial', trial_ends_at: new Date(Date.now() + TRIAL_DAYS_MS).toISOString(),
        referral_code: referralCodeGenerated,
      }).select('id').single();
      if (agentErr || !agent) throw new Error('Gagal membuat agent free trial.');
      agentId = agent.id;
      const { error: trialTxErr } = await supabaseAdmin.from('transactions').insert({
        agent_id: agent.id, amount: 0, payment_method: 'free_trial',
        status: 'PAID', payment_status: 'PAID', merchant_ref: trialRef,
        package_id: planPackageId, customer_name: name,
        customer_email: email.trim().toLowerCase(), customer_phone: phone,
      });
      if (trialTxErr) console.warn('[TRIAL] optional transaction log failed:', trialTxErr.code);
      redirectUrl = '/success?ref=trial&slug=' + encodeURIComponent(slug);
    } else {
      // Never create a real payment, or change an agent's status, in an unconfigured environment.
      requireMayarConfigured();
      const ref = randomUUID();
      if (isRenewal) {
        const { data: existing, error: lookupErr } = await supabaseAdmin.from('agents')
          .select('id,agent_name,owner_email')
          .eq('custom_agent_slug', slug).maybeSingle();
        if (lookupErr || !existing) return NextResponse.json({ error: 'Agent tidak ditemukan.' }, { status: 404 });
        if (String(existing.owner_email || '').trim().toLowerCase() !== email.trim().toLowerCase()) {
          return NextResponse.json({ error: 'Email pemilik agent tidak cocok.' }, { status: 403 });
        }
        agentId = existing.id;
        agentName = existing.agent_name;
      } else {
        const { data: agent, error: agentErr } = await supabaseAdmin.from('agents').insert({
          agent_name: agentName, knowledge_base: safeKnowledgeBaseFinal,
          system_prompt: systemPrompt, welcome_message: safeWelcomeMessage,
          custom_agent_slug: slug, payment_status: 'PENDING',
          owner_name: name, owner_email: email.trim().toLowerCase(), owner_phone: phone,
          telegram_chat_id: telegramChatId || null,
          plan_tier: planType === 'yearly' ? 'yearly' : 'basic',
          amount, referral_code: referralCodeGenerated,
          referred_by_agent_id: referredByAgentId,
        }).select('id').single();
        if (agentErr || !agent) throw new Error('Gagal menyiapkan AI Agent.');
        agentId = agent.id;
      }
      const { data: tx, error: txErr } = await supabaseAdmin.from('transactions').insert({
        agent_id: agentId, amount, status: 'UNPAID', payment_status: 'PENDING',
        payment_method: 'mayar', merchant_ref: ref, package_id: planPackageId,
        customer_name: name, customer_email: email.trim().toLowerCase(),
        customer_phone: phone,
      }).select('id').single();
      if (txErr || !tx) throw new Error('Gagal mencatat pesanan; tidak ada pembayaran dibuat.');
      const request = await createAgentSayaPayment({
        orderId: tx.id, plan: planType as 'monthly' | 'yearly',
        amount, email: email.trim().toLowerCase(), phone,
      });
      const { data: bound, error: bindErr } = await supabaseAdmin.from('transactions')
        .update({
          mayar_request_id: request.requestId,
          mayar_initial_transaction_id: request.initialTransactionId,
          mayar_checkout_url: request.checkoutUrl,
        })
        .eq('id', tx.id).eq('status', 'UNPAID').select('id').single();
      if (bindErr || !bound) {
        throw new Error('Pesanan Mayar tidak dapat diverifikasi. Jangan lakukan pembayaran.');
      }
      // Keep AgentSaya open so the customer can watch the paid status in a second tab.
      redirectUrl = '/payment?ref=' + encodeURIComponent(ref);
      paymentIsSandbox = isMayarSandbox();
    }

    const shareUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.agentsaya.site') + '/chat/' + slug;

    return NextResponse.json({
      success: true,
      agentId,
      slug,
      shareUrl,
      agentName,
      paymentUrl: redirectUrl,
      sandbox: paymentIsSandbox,
      pdfProcessed: pdfText.length > 0,
      pdfTextLength: pdfText.length,
      planType,
      amount: amount,
      amountFormatted: formatRupiah(amount),
    });
  } catch (err: unknown) {
    console.error('[CHECKOUT] CATCH BLOCK ERROR:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      success: false,
      error: message,
    }, { status: 500 });
  }
}

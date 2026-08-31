import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { BASIC_PLAN, TRIAL_PLAN, YEARLY_PLAN, formatRupiah } from '@/lib/plans';
import { slugify, randomSuffix, buildSystemPrompt, generateReferralCode } from '@/lib/agents';
import { createIpaymuPayment } from '@/lib/ipaymu';
import { extractText } from 'unpdf';
import { cleanKnowledgeBaseWithLLM } from '@/lib/llm';

const cleanPayloadText = (str: string) => {
  if (!str) return '';
  return str
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};

const IPAYMU_API_KEY = process.env.IPAYMU_API_KEY || process.env.IPAYMU_API_SANDBOX_KEY || '';
const IPAYMU_VA = process.env.IPAYMU_VA || '';
const isMockMode = !IPAYMU_API_KEY || !IPAYMU_VA;


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
    formData.append('language', 'ind');
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
  try {
    const contentType = req.headers.get('content-type') || '';
    
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
      
      const pdfFile = formData.get('pdfFile') as File | null;
      if (pdfFile) {
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
    }

    if (!agentName || !name || !email || !phone) {
      return NextResponse.json(
        { error: 'agentName, name, email, and phone are required.' },
        { status: 400 }
      );
    }

    const manualKnowledgeBase = knowledgeBase?.trim() || '';
    const welcome = welcomeMessage?.trim() || 'Halo! Saya Asisten Virtual ' + agentName + '. Ada yang bisa saya bantu hari ini?';
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

    let agentId: string | null = null;
    let transactionId: string | null = null;
    let redirectUrl: string | null = null;
    let paymentIsSandbox = true;

    const isRenewal = renewal && slug;

    if (isRenewal) {
      const { data: existingAgent, error: existingError } = await supabaseAdmin
        .from('agents')
        .select('id, payment_status, period_end, plan_tier')
        .eq('custom_agent_slug', slug)
        .maybeSingle();

      if (existingError || !existingAgent) {
        console.error('[CHECKOUT] Renewal agent lookup error:', existingError);
        return NextResponse.json(
          { error: 'Agent tidak ditemukan untuk perpanjangan.' },
          { status: 404 }
        );
      }

      const newPeriodEnd = new Date(Date.now() + planPeriodDays * 24 * 60 * 60 * 1000).toISOString();

      const { error: updateError } = await supabaseAdmin
        .from('agents')
        .update({
          payment_status: 'PAID',
          period_end: newPeriodEnd,
          plan_tier: planType === 'yearly' ? 'yearly' : 'basic',
        })
        .eq('id', existingAgent.id);

      if (updateError) {
        console.error('[CHECKOUT] Renewal agent update error:', updateError);
        return NextResponse.json(
          { error: 'Gagal memperpanjang langganan. Silakan coba lagi.' },
          { status: 500 }
        );
      }

      agentId = existingAgent.id;
    }

    if (planType === 'trial' && !isRenewal) {
      const trialMerchantRef = 'REF-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);

      const trialPayload = {
        agent_name: agentName,
        knowledge_base: safeKnowledgeBaseFinal,
        system_prompt: systemPrompt,
        welcome_message: safeWelcomeMessage,
        custom_agent_slug: slug,
        payment_status: 'TRIAL',
        owner_name: name,
        owner_email: email,
        owner_phone: phone,
        telegram_chat_id: telegramChatId || null,
        plan_tier: 'trial',
        trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        referral_code: referralCodeGenerated,
      };

      const { data: trialAgent, error: trialError } = await supabaseAdmin
        .from('agents')
        .insert(trialPayload)
        .select('id')
        .single();

      if (trialError || !trialAgent) {
        console.error('[CHECKOUT] Trial agent creation error:', trialError);
        return NextResponse.json(
          { error: 'Gagal membuat agent trial. Silakan coba lagi.' },
          { status: 500 }
        );
      }

      agentId = trialAgent.id;

      const { error: transactionError } = await supabaseAdmin
        .from('transactions')
        .insert({
          agent_id: agentId,
          amount: 0,
          payment_method: 'free_trial',
          payment_status: 'PAID',
          status: 'PAID',
          merchant_ref: trialMerchantRef,
          reference: 'TRIAL-' + Date.now(),
          package_id: planPackageId,
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
        });

      if (transactionError) {
        console.error('[CHECKOUT] Trial transaction creation error:', transactionError);
      }

      transactionId = trialMerchantRef;
      redirectUrl = '/success?ref=trial&slug=' + slug;
      paymentIsSandbox = true;
    } else if (!isRenewal) {
      const merchantRef = 'REF-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);

      const paidAgentPayload = {
        agent_name: agentName,
        knowledge_base: safeKnowledgeBaseFinal,
        system_prompt: systemPrompt,
        welcome_message: safeWelcomeMessage,
        custom_agent_slug: slug,
        payment_status: 'PAID',
        owner_name: name,
        owner_email: email,
        owner_phone: phone,
        telegram_chat_id: telegramChatId || null,
        plan_tier: planType === 'yearly' ? 'yearly' : 'basic',
        amount: amount,
        referral_code: referralCodeGenerated,
        referred_by_agent_id: referredByAgentId,
        period_start: new Date().toISOString(),
        period_end: new Date(Date.now() + planPeriodDays * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active',
      };

      console.log('[CHECKOUT] Insert paid agent to Supabase:', JSON.stringify(paidAgentPayload));

      const { data: paidAgent, error: paidError } = await supabaseAdmin
        .from('agents')
        .insert(paidAgentPayload)
        .select('id')
        .single();

      if (paidError || !paidAgent) {
        console.error('[CHECKOUT] Paid agent creation error:', paidError);
        return NextResponse.json(
          { error: 'Gagal membuat agent. Silakan coba lagi.' },
          { status: 500 }
        );
      }

      agentId = paidAgent.id;

      if (isMockMode) {
        console.log('[CHECKOUT] API Key kosong. Masuk ke mock mode.');

        const { error: transactionError } = await supabaseAdmin
          .from('transactions')
          .insert({
            agent_id: agentId,
            amount: amount,
            payment_method: 'mock_ipaymu',
            payment_status: 'PAID',
            status: 'PAID',
            merchant_ref: merchantRef,
            reference: 'MOCK-' + Date.now(),
            package_id: planPackageId,
            customer_name: name,
            customer_email: email,
            customer_phone: phone,
          });

        if (transactionError) {
          console.error('[CHECKOUT] Mock transaction creation error:', transactionError);
        }

        transactionId = merchantRef;
        redirectUrl = '/success?ref=MOCK&slug=' + slug;
        paymentIsSandbox = true;
      } else {
        console.log('[CHECKOUT] API Key terdeteksi. Memanggil iPaymu...');
        const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_BASE_URL || 'https://example.com';
        const returnUrl = `${origin}/success?ref=ipaymu&slug=${slug}`;
        const notifyUrl = `${origin}/api/webhooks/ipaymu`;
        const cancelUrl = `${origin}/`;

        let paymentUrl = '';
        let paymentSandbox = true;

        try {
          const ipaymu = await createIpaymuPayment({
            referenceId: merchantRef,
            productName: agentName,
            price: amount,
            buyerName: name,
            buyerEmail: email,
            buyerPhone: phone,
            returnUrl,
            notifyUrl,
            cancelUrl,
          });
          paymentUrl = ipaymu.url;
          paymentSandbox = ipaymu.sandbox;
        } catch (payErr) {
          console.error('[CHECKOUT] iPaymu payment creation failed:', payErr);
          const message = payErr instanceof Error ? payErr.message : String(payErr);
          return NextResponse.json(
            { error: message },
            { status: 500 }
          );
        }

        const { error: transactionError } = await supabaseAdmin
          .from('transactions')
          .insert({
            agent_id: agentId,
            amount: amount,
            payment_method: 'ipaymu',
            payment_status: 'PENDING',
            status: 'UNPAID',
            merchant_ref: merchantRef,
            reference: '',
            package_id: planPackageId,
            customer_name: name,
            customer_email: email,
            customer_phone: phone,
          });

        if (transactionError) {
          console.error('[CHECKOUT] Transaction creation error:', transactionError);
        }

        transactionId = merchantRef;
        redirectUrl = paymentUrl;
        paymentIsSandbox = paymentSandbox;
      }
    } else if (isRenewal) {
      const renewalMerchantRef = 'REF-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);

      if (isMockMode) {
        console.log('[CHECKOUT] Renewal mock mode active.');

        const { error: transactionError } = await supabaseAdmin
          .from('transactions')
          .insert({
            agent_id: agentId,
            amount: BASIC_PLAN.priceMonthly,
            payment_method: 'mock_ipaymu',
            payment_status: 'PAID',
            status: 'PAID',
            merchant_ref: renewalMerchantRef,
            reference: 'MOCK-' + Date.now(),
            package_id: planPackageId,
            customer_name: name,
            customer_email: email,
            customer_phone: phone,
          });

        if (transactionError) {
          console.error('[CHECKOUT] Renewal mock transaction creation error:', transactionError);
        }

        transactionId = renewalMerchantRef;
        redirectUrl = '/success?ref=MOCK&slug=' + slug;
        paymentIsSandbox = true;
      } else {
        console.log('[CHECKOUT] Renewal mode. Memanggil iPaymu...');
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
        const returnUrl = `${baseUrl}/success?ref=ipaymu&slug=${slug}`;
        const notifyUrl = `${baseUrl}/api/webhooks/ipaymu`;
        const cancelUrl = `${baseUrl}/`;

        let paymentUrl = '';
        let paymentSandbox = true;

        try {
          const ipaymu = await createIpaymuPayment({
            referenceId: renewalMerchantRef,
            productName: agentName + ' (Perpanjangan)',
            price: BASIC_PLAN.priceMonthly,
            buyerName: name,
            buyerEmail: email,
            buyerPhone: phone,
            returnUrl,
            notifyUrl,
            cancelUrl,
          });
          paymentUrl = ipaymu.url;
          paymentSandbox = ipaymu.sandbox;
        } catch (payErr) {
          console.error('[CHECKOUT] iPaymu renewal payment creation failed:', payErr);
          return NextResponse.json(
            { error: 'Gagal membuat link pembayaran perpanjangan. Silakan coba lagi.' },
            { status: 500 }
          );
        }

        const { error: transactionError } = await supabaseAdmin
          .from('transactions')
          .insert({
            agent_id: agentId,
            amount: BASIC_PLAN.priceMonthly,
            payment_method: 'ipaymu',
            payment_status: 'PENDING',
            status: 'UNPAID',
            merchant_ref: renewalMerchantRef,
            reference: '',
            package_id: planPackageId,
            customer_name: name,
            customer_email: email,
            customer_phone: phone,
          });

        if (transactionError) {
          console.error('[CHECKOUT] Renewal transaction creation error:', transactionError);
        }

        transactionId = renewalMerchantRef;
        redirectUrl = paymentUrl;
        paymentIsSandbox = paymentSandbox;
      }
    }

    const shareUrl = 'http://localhost:3000/chat/' + slug;

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

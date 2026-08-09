import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { BASIC_PLAN, TRIAL_PLAN, formatRupiah } from '@/lib/plans';
import { slugify, randomSuffix, buildSystemPrompt, generateReferralCode } from '@/lib/agents';
import { createQrisPayment } from '@/lib/payment';
import { extractText } from 'unpdf';
import { cleanKnowledgeBaseWithLLM } from '@/lib/llm';


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
    const apiKey = process.env.OCR_SPACE_API_KEY || 'helloworld';
    console.log('[OCR] Calling OCR.space for mimeType:', mimeType, 'data length:', data.length);

    const ocrFormData = new FormData();
    const blob = new Blob([data], { type: mimeType });
    ocrFormData.append('apikey', apiKey);
    ocrFormData.append('file', blob, 'upload.' + mimeType.split('/')[1]);
    ocrFormData.append('language', 'eng');

    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: ocrFormData,
    });

    if (!res.ok) {
      console.error('[OCR] OCR.space request failed with status:', res.status);
      return '';
    }

    const json = await res.json();
    console.log('[OCR] OCR.space response:', JSON.stringify(json).substring(0, 200));

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
  try {
    const contentType = req.headers.get('content-type') || '';
    
    let agentName: string = '';
    let knowledgeBase: string = '';
    let welcomeMessage: string = '';
    let name: string = '';
    let email: string = '';
    let phone: string = '';
    let referralCode: string = '';
    let planType: 'trial' | 'paid' = 'paid';
    let pdfText: string = '';
    let additionalNotes: string = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      
      agentName = formData.get('agentName') as string || '';
      knowledgeBase = formData.get('knowledgeBase') as string || '';
      welcomeMessage = formData.get('welcomeMessage') as string || '';
      name = formData.get('name') as string || '';
      email = formData.get('email') as string || '';
      phone = formData.get('phone') as string || '';
      referralCode = formData.get('referralCode') as string || '';
      planType = (formData.get('planType') as string) as 'trial' | 'paid' || 'paid';
      additionalNotes = formData.get('additionalNotes') as string || '';
      
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

              const visionResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': 'Bearer ' + openRouterKey,
                  'Content-Type': 'application/json',
                  'HTTP-Referer': 'http://localhost:3000',
                  'X-Title': 'AgentKu',
                },
                body: JSON.stringify({
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
                }),
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

              if (!rawText || rawText.trim().length < 20) {
                return NextResponse.json(
                  { error: 'PDF berupa foto/scan dan tidak terbaca. Silakan unggah PDF berformat teks atau tempelkan data di kolom manual.' },
                  { status: 400 }
                );
              }

              const completionResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': 'Bearer ' + openRouterKey,
                  'Content-Type': 'application/json',
                  'HTTP-Referer': 'http://localhost:3000',
                  'X-Title': 'AgentKu',
                },
                body: JSON.stringify({
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
                }),
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
          } catch (pdfError) {
            console.error('[CHECKOUT VISION] Error processing file:', pdfError);
            return NextResponse.json(
              { error: 'Gagal memproses berkas via OpenRouter: ' + (pdfError instanceof Error ? pdfError.message : String(pdfError)) },
              { status: 400 }
            );
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
      planType = body.planType || 'paid';
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
    
    const safeKnowledgeBaseFinal = combinedKnowledgeBase || '';
    const systemPrompt = buildSystemPrompt({
      agentName: agentName,
      knowledgeBase: safeKnowledgeBaseFinal,
      ownerName: name,
      ownerPhone: phone,
      additionalNotes: additionalNotes,
    });

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

    let slug = slugify(agentName) || 'agent';
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
    const amount = planType === 'trial' ? 0 : TRIAL_PLAN.priceMonthly;

    let agentId: string | null = null;
    let transactionId: string | null = null;

    if (planType === 'trial') {
      const { data: trialAgent, error: trialError } = await supabaseAdmin
        .from('agents')
        .insert({
          agent_name: agentName,
          knowledge_base: safeKnowledgeBaseFinal,
          system_prompt: systemPrompt,
          welcome_message: safeWelcomeMessage,
          custom_agent_slug: slug,
          payment_status: 'TRIAL',
          owner_name: name,
          owner_email: email,
          owner_phone: phone,
          plan_tier: 'trial',
          trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          referral_code: referralCodeGenerated,
        })
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
    } else {
      const merchantRef = 'REF-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
      const payment = await createQrisPayment({
        merchantRef: merchantRef,
        amount: amount,
        packageName: agentName,
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
      });

      if (!payment?.merchantRef || !payment?.reference) {
        console.error('[CHECKOUT] Payment creation failed');
        return NextResponse.json(
          { error: 'Gagal membuat pembayaran. Silakan coba lagi.' },
          { status: 500 }
        );
      }

      const { data: paidAgent, error: paidError } = await supabaseAdmin
        .from('agents')
        .insert({
          agent_name: agentName,
          knowledge_base: safeKnowledgeBaseFinal,
          system_prompt: systemPrompt,
          welcome_message: safeWelcomeMessage,
          custom_agent_slug: slug,
          payment_status: 'PENDING',
          owner_name: name,
          owner_email: email,
          owner_phone: phone,
          plan_tier: 'basic',
          amount: amount,
          referral_code: referralCodeGenerated,
          referred_by_agent_id: referredByAgentId,
        })
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

      const { error: transactionError } = await supabaseAdmin
        .from('transactions')
        .insert({
          agent_id: agentId,
          amount: amount,
          payment_method: 'qris',
          payment_status: 'PENDING',
          merchant_ref: payment.merchantRef,
          reference: payment.reference,
        });

      if (transactionError) {
        console.error('[CHECKOUT] Transaction creation error:', transactionError);
      }

      transactionId = payment.merchantRef;
    }

    const shareUrl = 'http://localhost:3000/chat/' + slug;

    return NextResponse.json({
      success: true,
      agentId,
      slug,
      shareUrl,
      agentName,
      sandbox: true,
      pdfProcessed: pdfText.length > 0,
      pdfTextLength: pdfText.length,
      planType,
      amount: planType === 'trial' ? 0 : TRIAL_PLAN.priceMonthly,
      amountFormatted: formatRupiah(planType === 'trial' ? 0 : TRIAL_PLAN.priceMonthly),
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

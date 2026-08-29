import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { buildSystemPrompt } from '@/lib/agents';
import { extractText } from 'unpdf';

/**
 * Helper function to extract text from PDF buffer using unpdf
 */
async function extractTextFromPDF(data: Uint8Array): Promise<string> {
  try {
    const { text } = await extractText(data);
    // unpdf returns text as array of strings (one per page), join them
    const textArray = Array.isArray(text) ? text : [text];
    return textArray.join('\n\n') || '';
  } catch (error) {
    console.error('[PDF EXTRACTION] Error extracting text from PDF:', error);
    return '';
  }
}

/**
 * POST /api/dashboard/update-agent
 * Updates agent knowledge base and regenerates system prompt
 */
export async function POST(req: NextRequest) {
  try {
    // Check if request is multipart/form-data (file upload) or JSON
    const contentType = req.headers.get('content-type') || '';
    
    let agentId: string = '';
    let knowledgeBase: string = '';
    let agentName: string = '';
    let welcomeMessage: string = '';
    let telegramChatId: string = '';
    let pdfText: string = '';
    let additionalNotes: string = '';

    if (contentType.includes('multipart/form-data')) {
      // Handle FormData with file upload
      const formData = await req.formData();
      
      agentId = formData.get('agentId') as string || '';
      knowledgeBase = formData.get('knowledgeBase') as string || '';
      agentName = formData.get('agentName') as string || '';
      welcomeMessage = formData.get('welcomeMessage') as string || '';
      telegramChatId = formData.get('telegramChatId') as string || '';
      additionalNotes = formData.get('additionalNotes') as string || '';
      
      // Handle PDF file upload
      const pdfFile = formData.get('pdfFile') as File | null;
      if (pdfFile) {
        console.log('[PDF UPDATE] File detected:', pdfFile.name, pdfFile.type, pdfFile.size);
        
        // Validate file size (max 10MB)
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        if (pdfFile.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            { error: 'Ukuran file PDF terlalu besar. Maksimal 10MB.' },
            { status: 400 }
          );
        }
        
        // Validate file type
        if (pdfFile.type !== 'application/pdf') {
          return NextResponse.json(
            { error: 'File harus berupa PDF.' },
            { status: 400 }
          );
        }
        
        try {
          // Convert File to Uint8Array (unpdf requires Uint8Array, not Buffer)
          const arrayBuffer = await pdfFile.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Extract text from PDF
          pdfText = await extractTextFromPDF(uint8Array);
          console.log('[PDF UPDATE] Extracted text length:', pdfText.length);
          
          if (pdfText.length > 0) {
            console.log('[PDF UPDATE] First 200 chars:', pdfText.substring(0, 200));
          } else {
            console.warn('[PDF UPDATE] No text extracted from PDF');
          }
        } catch (pdfError) {
          console.error('[PDF UPDATE] Error processing PDF file:', pdfError);
          return NextResponse.json(
            { error: 'Gagal memproses file PDF. Pastikan file tidak rusak.' },
            { status: 400 }
          );
        }
      }
    } else {
      // Handle regular JSON request
      const body = await req.json();
      
      agentId = body.agentId || '';
      knowledgeBase = body.knowledgeBase || '';
      agentName = body.agentName || '';
      welcomeMessage = body.welcomeMessage || '';
      telegramChatId = body.telegramChatId || '';
    }

    if (!agentId) {
      return NextResponse.json(
        { error: 'agentId is required' },
        { status: 400 }
      );
    }

    // Get current agent data using admin client to bypass RLS
    const { data: agent, error: fetchError } = await supabaseAdmin
      .from('agents')
      .select('agent_name, welcome_message, owner_name, owner_phone')
      .eq('id', agentId)
      .maybeSingle();

    if (fetchError) {
      console.error('=== DETAIL ERROR SUPABASE (FETCH AGENT) ===', fetchError);
      return NextResponse.json(
        { 
          success: false, 
          error: fetchError?.message || fetchError?.details || JSON.stringify(fetchError),
          errorDetails: {
            code: fetchError?.code,
            message: fetchError?.message,
            details: fetchError?.details,
            hint: fetchError?.hint
          }
        },
        { status: 500 }
      );
    }

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Use provided values or fallback to existing values
    const safeAgentName = agentName || agent.agent_name || 'Agent';
    const safeWelcomeMessage = welcomeMessage || agent.welcome_message || 'Halo!';
    const manualKnowledgeBase = knowledgeBase || '';
    
    // Combine PDF text with manual knowledge base
    let combinedKnowledgeBase = manualKnowledgeBase;
    if (pdfText && pdfText.length > 0) {
      if (combinedKnowledgeBase.length > 0) {
        combinedKnowledgeBase += '\n\n--- ISI DOKUMEN PDF ---\n\n' + pdfText;
      } else {
        combinedKnowledgeBase = pdfText;
      }
      console.log('[KNOWLEDGE BASE UPDATE] Combined PDF text with manual input. Total length:', combinedKnowledgeBase.length);
    }
    
    const safeKnowledgeBase = combinedKnowledgeBase || '';

    // Regenerate system prompt with new knowledge base
    const systemPrompt = buildSystemPrompt({
      agentName: safeAgentName,
      knowledgeBase: safeKnowledgeBase,
      ownerName: agent.owner_name,
      ownerPhone: agent.owner_phone,
      additionalNotes: additionalNotes,
    });

    // Update agent using admin client to bypass RLS
    const { error: updateError } = await supabaseAdmin
      .from('agents')
      .update({
        agent_name: safeAgentName,
        knowledge_base: safeKnowledgeBase,
        system_prompt: systemPrompt,
        welcome_message: safeWelcomeMessage,
        telegram_chat_id: telegramChatId || null,
      })
      .eq('id', agentId);

    if (updateError) {
      console.error('=== DETAIL ERROR SUPABASE (UPDATE AGENT) ===', updateError);
      return NextResponse.json(
        { 
          success: false, 
          error: updateError?.message || updateError?.details || JSON.stringify(updateError),
          errorDetails: {
            code: updateError?.code,
            message: updateError?.message,
            details: updateError?.details,
            hint: updateError?.hint
          }
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true,
      pdfProcessed: pdfText.length > 0,
      pdfTextLength: pdfText.length,
    });
  } catch (err: unknown) {
    console.error('=== CATCH BLOCK ERROR (UPDATE AGENT) ===', err);
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    return NextResponse.json(
      { 
        success: false, 
        error: message,
        errorDetails: err instanceof Error ? {
          name: err.name,
          message: err.message,
          stack: err.stack
        } : null
      },
      { status: 500 }
    );
  }
}

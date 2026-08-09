import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { extractReceiptInfo, verifyPayment } from '@/lib/payment-verification';
import { sendVerificationRequest } from '@/lib/telegram';

/**
 * POST /api/checkout/verify-receipt
 * Verifies payment receipt using demo mode (accepts uploaded files as valid)
 * Auto-activates agent if verification succeeds, otherwise sends to Telegram for manual review
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const merchantRef = formData.get('merchantRef') as string;
    const amount = formData.get('amount') as string;
    const agentId = formData.get('agentId') as string | null;

    if (!file || !merchantRef || !amount) {
      return NextResponse.json(
        { error: 'file, merchantRef, and amount are required' },
        { status: 400 }
      );
    }

    const expectedAmount = parseInt(amount, 10);
    if (isNaN(expectedAmount)) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      );
    }

    // Get transaction info
    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .select('id, customer_name, customer_email, customer_phone')
      .eq('merchant_ref', merchantRef)
      .maybeSingle();

    if (txError || !tx) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Try to get agent info - first by agentId if provided, then by transaction_id
    let agent: { id: string; agent_name: string; owner_name: string; owner_email: string; owner_phone: string } | null = null;
    let agentError: Error | null = null;

    if (agentId) {
      // Try to get agent by ID using SECURITY DEFINER function
      const { data: agentById, error: byIdError } = await supabase
        .rpc('get_agent_by_transaction_id', { p_transaction_id: tx.id });
      
      if (!byIdError && agentById && agentById.length > 0) {
        agent = agentById[0];
      }
    }

    // Fallback: try to get agent by transaction_id
    if (!agent) {
      const { data: agentByTx, error: byTxError } = await supabase
        .rpc('get_agent_by_transaction_id', { p_transaction_id: tx.id });
      
      if (!byTxError && agentByTx && agentByTx.length > 0) {
        agent = agentByTx[0];
      } else {
        agentError = byTxError;
      }
    }

    // If agent still not found, use transaction data as fallback
    if (!agent) {
      console.warn('Agent not found, using transaction data as fallback');
      // Create a temporary agent object from transaction data
      agent = {
        id: tx.id, // Use transaction ID as fallback
        agent_name: 'AI Agent', // Default name
        owner_name: tx.customer_name,
        owner_email: tx.customer_email,
        owner_phone: tx.customer_phone,
      };
    }

    // Perform OCR on receipt
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const receiptBase64 = buffer.toString('base64');
    const ocrResult = await extractReceiptInfo(buffer);

    // Verify payment
    const verification = verifyPayment(ocrResult, expectedAmount);

    if (verification.valid) {
      // Auto-activate agent using the activate_agent function
      // This function handles finding the agent by transaction
      const { error: activateError } = await supabase
        .rpc('activate_agent', {
          p_merchant_ref: merchantRef,
          p_reference: merchantRef,
        });

      if (activateError) {
        console.error('Auto-activation failed:', activateError);
        // Fall through to manual review
      } else {
        // Send Telegram notification for auto-approved payment
        await sendVerificationRequest(
          merchantRef,
          agent.owner_name,
          agent.agent_name,
          expectedAmount,
          `✅ Auto-Approved (Confidence: ${ocrResult.confidence})`,
          undefined // No photo for auto-approved
        );

        return NextResponse.json({
          success: true,
          message: 'Payment verified and agent activated',
          ocrResult,
        });
      }
    }

    // Verification failed or uncertain - send to Telegram for manual review
    const ocrSummary =
      `Amount: ${ocrResult.amount_paid || 'N/A'}\n` +
      `Status: ${ocrResult.status || 'N/A'}\n` +
      `Confidence: ${ocrResult.confidence}\n` +
      `Reason: ${verification.reason}`;

    await sendVerificationRequest(
      merchantRef,
      agent.owner_name,
      agent.agent_name,
      expectedAmount,
      ocrSummary,
      receiptBase64
    );

    return NextResponse.json({
      success: false,
      error: verification.reason,
      message: 'Payment sent for manual review',
      ocrResult,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Receipt verification error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
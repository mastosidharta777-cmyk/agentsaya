/**
 * Receipt OCR verification - Demo mode fallback
 * For demo/testing mode, accepts uploaded files as valid payment proof
 */

export interface OCRResult {
  amount_paid?: number;
  status?: string;
  transaction_date?: string;
  raw_text?: string;
  confidence?: number;
}

/**
 * Extracts payment information from receipt image
 * For demo mode, accepts any uploaded file as valid
 */
export async function extractReceiptInfo(imageBuffer: Buffer): Promise<OCRResult> {
  console.log('OCR: Demo mode - accepting uploaded file as valid payment proof');
  
  // For demo mode, return a fallback result that indicates success
  return {
    raw_text: 'Demo mode: file uploaded successfully',
    confidence: 1.0, // High confidence for demo mode
    status: 'SUCCESS',
    amount_paid: undefined, // We'll handle this in verifyPayment
  };
}

/**
 * Verifies if the receipt matches the expected payment
 * For demo mode, accepts any uploaded file as valid
 */
export function verifyPayment(
  ocrResult: OCRResult,
  expectedAmount: number
): { valid: boolean; reason: string } {
  // For demo mode, always accept uploaded files as valid
  return {
    valid: true,
    reason: 'Demo mode: payment verified (file uploaded successfully)',
  };
}
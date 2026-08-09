import { NextRequest, NextResponse } from 'next/server';
import { extractText } from 'unpdf';

/**
 * POST /api/extract-pdf
 * Extracts text from uploaded PDF files
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are supported' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { text } = await extractText(uint8Array);
    // unpdf returns text as array of strings (one per page), join them
    const textArray = Array.isArray(text) ? text : [text];
    const fullText = textArray.join('\n\n');

    return NextResponse.json({ text: fullText });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

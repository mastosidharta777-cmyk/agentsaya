import { NextRequest, NextResponse } from 'next/server';
import { extractText } from 'unpdf';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('PDF extraction timeout')), ms)
  );
  return Promise.race([promise, timeout]);
}

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

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File terlalu besar. Maksimal 10MB.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { text } = await withTimeout(
      extractText(uint8Array),
      25000
    );
    const textArray = Array.isArray(text) ? text : [text];
    const fullText = textArray.join('\n\n');

    return NextResponse.json({ text: fullText });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[PDF EXTRACT]', message);
    return NextResponse.json(
      { error: message || 'Gagal mengekstrak teks PDF' },
      { status: 500 }
    );
  }
}

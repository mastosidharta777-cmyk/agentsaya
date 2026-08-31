import { NextRequest, NextResponse } from 'next/server';

const OCR_API_URL = 'https://api.ocr.space/parse/image';
const OCR_API_KEY = process.env.OCR_SPACE_API_KEY || '';

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Image OCR timeout')), ms)
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

    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      return NextResponse.json(
        { error: 'Only image files are supported' },
        { status: 400 }
      );
    }

    if (!OCR_API_KEY) {
      return NextResponse.json(
        { error: 'OCR service is not configured' },
        { status: 500 }
      );
    }

    const ocrFormData = new FormData();
    ocrFormData.append('file', file);
    ocrFormData.append('language', 'ind');
    ocrFormData.append('isOverlayRequired', 'false');
    ocrFormData.append('detectOrientation', 'true');
    ocrFormData.append('scale', 'true');
    ocrFormData.append('ocrengine', '2');

    const res = await withTimeout(
      fetch(OCR_API_URL, {
        method: 'POST',
        headers: {
          apikey: OCR_API_KEY,
        },
        body: ocrFormData,
      }),
      45000
    );

    if (!res.ok) {
      const detail = await res.text();
      console.error('OCR Error detail:', detail);
      return NextResponse.json(
        { error: `OCR.space API error: ${res.status}` },
        { status: 500 }
      );
    }

    const raw = await res.text();
    console.log('OCR API Raw Response:', raw);

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: 'Gagal membaca respons OCR.space' },
        { status: 500 }
      );
    }

    if (data.IsErroredOnProcessing === true) {
      const message = Array.isArray(data.ErrorMessage)
        ? data.ErrorMessage[0]
        : data.ErrorMessage || 'OCR processing error';
      return NextResponse.json(
        { error: message },
        { status: 422 }
      );
    }

    if (data.ParsedResults && data.ParsedResults.length > 0) {
      const text = data.ParsedResults[0].ParsedText || '';
      if (text.trim().length > 0) {
        return NextResponse.json({ text });
      }
    }

    return NextResponse.json(
      { error: 'Tidak dapat membaca teks dari gambar. Pastikan gambar jelas dan tidak blur.' },
      { status: 422 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[IMAGE OCR]', message);
    return NextResponse.json(
      { error: message || 'Gagal memproses gambar' },
      { status: 500 }
    );
  }
}
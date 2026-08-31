import { NextRequest, NextResponse } from 'next/server';
import { extractText } from 'unpdf';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIN_TEXT_LENGTH = 20;
const OCR_API_URL = 'https://api.ocr.space/parse/image';
const OCR_API_KEY = process.env.OCR_SPACE_API_KEY || '';

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('PDF extraction timeout')), ms)
  );
  return Promise.race([promise, timeout]);
}

async function tryOcrSpace(file: File): Promise<string> {
  if (!OCR_API_KEY) {
    return '';
  }

  const formData = new FormData();
  formData.append('file', file, 'file.pdf');
  formData.append('language', 'ind');
  formData.append('isOverlayRequired', 'false');
  formData.append('detectOrientation', 'true');
  formData.append('scale', 'true');
  formData.append('ocrengine', '2');

  const res = await fetch(OCR_API_URL, {
    method: 'POST',
    headers: {
      apikey: OCR_API_KEY,
    },
    body: formData,
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('OCR Error detail:', detail);
    throw new Error(`OCR.space API error: ${res.status}`);
  }

  const raw = await res.text();
  console.log('OCR API Raw Response:', raw);

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Gagal membaca respons OCR.space');
  }

  if (data.IsErroredOnProcessing === true) {
    const message = Array.isArray(data.ErrorMessage)
      ? data.ErrorMessage[0]
      : data.ErrorMessage || 'OCR processing error';
    throw new Error(message);
  }

  if (data.ParsedResults && data.ParsedResults.length > 0) {
    return data.ParsedResults[0].ParsedText || '';
  }

  return '';
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

    let fullText = '';
    try {
      const { text } = await withTimeout(
        extractText(uint8Array),
        25000
      );
      const textArray = Array.isArray(text) ? text : [text];
      fullText = textArray.join('\n\n');
    } catch (err) {
      console.error('[PDF EXTRACT] unpdf failed:', err);
    }

    if (!fullText || fullText.trim().length < MIN_TEXT_LENGTH) {
      console.log('[PDF EXTRACT] Text too short, trying OCR fallback');
      if (file.size > 1048576) {
        return NextResponse.json(
          { error: 'PDF berbasis gambar ini ukurannya melebihi batas OCR gratis (maksimal 1 MB). Silakan upload file < 1 MB atau tempel teks manual.' },
          { status: 422 }
        );
      }
      try {
        const ocrText = await withTimeout(tryOcrSpace(file), 45000);
        if (ocrText && ocrText.trim().length > 0) {
          fullText = ocrText;
        }
      } catch (err) {
        console.error('[PDF EXTRACT] OCR fallback failed:', err);
      }
    }

    if (!fullText || fullText.trim().length === 0) {
      return NextResponse.json(
        { error: 'Gagal mengekstrak teks dari PDF. File mungkin berupa gambar/scan yang tidak dapat dibaca.' },
        { status: 422 }
      );
    }

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
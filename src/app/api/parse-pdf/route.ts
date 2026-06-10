import { NextRequest, NextResponse } from 'next/server';
import { extractText } from 'unpdf';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const buffer = new Uint8Array(await file.arrayBuffer());

  if (file.name.endsWith('.pdf')) {
    const { text } = await extractText(buffer);
    const joined = Array.isArray(text) ? text.join('\n') : String(text ?? '');
    return NextResponse.json({ text: joined });
  }

  return NextResponse.json({ text: new TextDecoder().decode(buffer) });
}

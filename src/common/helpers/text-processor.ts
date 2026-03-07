import { readFile } from 'node:fs/promises';

export function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const cleaned = cleanText(text);
  const words = cleaned.split(' ');
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let wordCount = 0;

  for (const word of words) {
    currentChunk.push(word);
    wordCount++;

    if (wordCount >= chunkSize) {
      chunks.push(currentChunk.join(' '));
      currentChunk = currentChunk.slice(-overlap);
      wordCount = currentChunk.length;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks;
}

export async function extractTextFromPDF(filepath: string): Promise<string> {
  const pdfParse = (await import('pdf-parse-fork')).default;
  const buffer = await readFile(filepath);
  const data = await pdfParse(buffer) as { text: string };
  return cleanText(data.text);
}

export async function extractTextFromDOCX(filepath: string): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ path: filepath });
  return cleanText(result.value);
}

export async function extractTextFromTXT(filepath: string): Promise<string> {
  const content = await readFile(filepath, 'utf-8');
  return cleanText(content);
}

export async function extractText(filepath: string, fileType: string): Promise<string> {
  const type = fileType.toLowerCase();
  switch (type) {
    case 'pdf':
      return extractTextFromPDF(filepath);
    case 'docx':
      return extractTextFromDOCX(filepath);
    case 'txt':
      return extractTextFromTXT(filepath);
    default:
      throw new Error(`Unsupported file type: ${type}`);
  }
}

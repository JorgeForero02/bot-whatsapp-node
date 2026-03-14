export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function serializeVector(vector: number[]): Buffer {
  const buffer = Buffer.alloc(vector.length * 4);
  for (let i = 0; i < vector.length; i++) {
    buffer.writeFloatLE(vector[i], i * 4);
  }
  return buffer;
}

function isHexBuffer(buf: Buffer): boolean {
  for (let i = 0; i < Math.min(buf.length, 16); i++) {
    const b = buf[i];
    const isHexChar = (b >= 0x30 && b <= 0x39) || (b >= 0x61 && b <= 0x66) || (b >= 0x41 && b <= 0x46);
    if (!isHexChar) return false;
  }
  return true;
}

export function unserializeVector(data: string | Buffer | Uint8Array): number[] {
  let buf: Buffer;
  if (typeof data === 'string') {
    buf = Buffer.from(data, 'hex');
  } else {
    const rawBuf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (isHexBuffer(rawBuf)) {
      buf = Buffer.from(rawBuf.toString('ascii'), 'hex');
    } else {
      buf = rawBuf;
    }
  }
  const length = buf.length / 4;
  const vector: number[] = new Array(length);
  for (let i = 0; i < length; i++) {
    vector[i] = buf.readFloatLE(i * 4);
  }
  return vector;
}

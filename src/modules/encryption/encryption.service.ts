import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-cbc';
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const cipherKey = this.config.get<string>('app.cipherKey') ?? '';
    this.key = Buffer.from(cipherKey.padEnd(32, '0').slice(0, 32), 'utf-8');
  }

  encrypt(value: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.key, iv);
    let encrypted = cipher.update(value, 'utf-8', 'base64');
    encrypted += cipher.final('base64');
    const ivBase64 = iv.toString('base64');
    return `${ivBase64}:${encrypted}`;
  }

  decrypt(encryptedValue: string): string {
    const parts = encryptedValue.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted value format');
    }
    const iv = Buffer.from(parts[0], 'base64');
    const encrypted = parts[1];
    const decipher = createDecipheriv(this.algorithm, this.key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  }

  decryptSafe(value: string): string {
    try {
      if (!this.isEncrypted(value)) {
        return value;
      }
      return this.decrypt(value);
    } catch {
      this.logger.warn('Decryption failed, returning original value');
      return value;
    }
  }

  isEncrypted(value: string): boolean {
    if (!value || !value.includes(':')) return false;
    const parts = value.split(':');
    if (parts.length !== 2) return false;
    try {
      const decoded = Buffer.from(parts[0], 'base64');
      return decoded.length === 16;
    } catch {
      return false;
    }
  }
}

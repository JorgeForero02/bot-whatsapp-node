import { describe, it, expect, beforeEach } from 'vitest';
import { EncryptionService } from './encryption.service';

function createService(cipherKey: string): EncryptionService {
  const mockConfig = { get: (key: string) => (key === 'app.cipherKey' ? cipherKey : '') };
  return new EncryptionService(mockConfig as any);
}

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    service = createService('abcdefghijklmnopqrstuvwxyz123456');
  });

  describe('encrypt / decrypt', () => {
    it('should encrypt and decrypt a value bidirectionally', () => {
      const original = 'my-secret-api-key';
      const encrypted = service.encrypt(original);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should produce different ciphertext for the same plaintext (random IV)', () => {
      const original = 'same-value';
      const a = service.encrypt(original);
      const b = service.encrypt(original);
      expect(a).not.toBe(b);
      expect(service.decrypt(a)).toBe(original);
      expect(service.decrypt(b)).toBe(original);
    });

    it('should handle empty strings', () => {
      const encrypted = service.encrypt('');
      expect(service.decrypt(encrypted)).toBe('');
    });

    it('should handle unicode characters', () => {
      const original = 'clave secreta con ñ y émojis 🔑';
      const encrypted = service.encrypt(original);
      expect(service.decrypt(encrypted)).toBe(original);
    });
  });

  describe('isEncrypted', () => {
    it('should return true for encrypted values', () => {
      const encrypted = service.encrypt('test');
      expect(service.isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(service.isEncrypted('plain-text')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(service.isEncrypted('')).toBe(false);
    });

    it('should return false for value with colon but invalid base64 IV', () => {
      expect(service.isEncrypted('not-base64:some-data')).toBe(false);
    });
  });

  describe('decryptSafe', () => {
    it('should decrypt encrypted values', () => {
      const encrypted = service.encrypt('safe-test');
      expect(service.decryptSafe(encrypted)).toBe('safe-test');
    });

    it('should return original value if not encrypted', () => {
      expect(service.decryptSafe('plain-value')).toBe('plain-value');
    });
  });

  describe('invalid key', () => {
    it('should not throw on construction with short key (pads to 32)', () => {
      expect(() => createService('short')).not.toThrow();
    });

    it('should fail to decrypt with a different key', () => {
      const encrypted = service.encrypt('secret');
      const otherService = createService('zyxwvutsrqponmlkjihgfedcba654321');
      expect(() => otherService.decrypt(encrypted)).toThrow();
    });
  });
});

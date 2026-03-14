import { describe, it, expect } from 'vitest';
import { WhatsAppService } from './whatsapp.service';

function createService(): WhatsAppService {
  const mockHttp = {} as any;
  const mockConfig = { get: () => '' } as any;
  const mockCredentials = {} as any;
  return new WhatsAppService(mockHttp, mockConfig, mockCredentials);
}

describe('WhatsAppService', () => {
  const service = createService();

  describe('verifyWebhook', () => {
    it('should return challenge when mode is subscribe and token matches', () => {
      const result = service.verifyWebhook('subscribe', 'my-token', 'challenge-123', 'my-token');
      expect(result).toBe('challenge-123');
    });

    it('should return false when token does not match', () => {
      const result = service.verifyWebhook('subscribe', 'wrong-token', 'challenge-123', 'my-token');
      expect(result).toBe(false);
    });

    it('should return false when mode is not subscribe', () => {
      const result = service.verifyWebhook('unsubscribe', 'my-token', 'challenge-123', 'my-token');
      expect(result).toBe(false);
    });
  });

  describe('parseWebhookPayload', () => {
    it('should parse a valid text message payload', () => {
      const payload = {
        entry: [{
          changes: [{
            value: {
              contacts: [{ profile: { name: 'Jorge' } }],
              messages: [{
                from: '573001234567',
                id: 'wamid.abc123',
                timestamp: '1700000000',
                type: 'text',
                text: { body: 'Hola!' },
              }],
            },
          }],
        }],
      };

      const result = service.parseWebhookPayload(payload);
      expect(result).not.toBeNull();
      expect(result!.from).toBe('573001234567');
      expect(result!.text).toBe('Hola!');
      expect(result!.messageId).toBe('wamid.abc123');
      expect(result!.contactName).toBe('Jorge');
      expect(result!.type).toBe('text');
    });

    it('should parse an audio message payload', () => {
      const payload = {
        entry: [{
          changes: [{
            value: {
              contacts: [{ profile: { name: 'User' } }],
              messages: [{
                from: '573009999999',
                id: 'wamid.audio1',
                timestamp: '1700000001',
                type: 'audio',
                audio: { id: 'media-id-123', mime_type: 'audio/ogg' },
              }],
            },
          }],
        }],
      };

      const result = service.parseWebhookPayload(payload);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('audio');
      expect(result!.audioId).toBe('media-id-123');
      expect(result!.mimeType).toBe('audio/ogg');
    });

    it('should return null for empty payload', () => {
      expect(service.parseWebhookPayload({})).toBeNull();
    });

    it('should return null for payload without messages', () => {
      const payload = {
        entry: [{
          changes: [{
            value: { statuses: [{ id: 'wamid.status1' }] },
          }],
        }],
      };
      expect(service.parseWebhookPayload(payload)).toBeNull();
    });

    it('should return null for payload with empty entry', () => {
      expect(service.parseWebhookPayload({ entry: [] })).toBeNull();
    });
  });
});

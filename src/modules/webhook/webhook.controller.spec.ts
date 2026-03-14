import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { WebhookController } from './webhook.controller';

const APP_SECRET = 'test-app-secret-for-hmac';

function createController(appSecret = APP_SECRET) {
  const mockWhatsapp = {
    verifyWebhook: vi.fn(),
    parseWebhookPayload: vi.fn().mockReturnValue(null),
  };
  const mockConfig = {
    get: vi.fn().mockReturnValue(undefined),
  };
  const mockCredentials = {
    getWhatsAppCredentials: vi.fn().mockResolvedValue({
      accessToken: 'token',
      phoneNumberId: 'phone-id',
      verifyToken: 'verify-token',
      appSecret,
    }),
  };
  const mockDb = {
    db: { insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([{ insertId: 1 }]) }) },
  };
  const mockQueue = {
    add: vi.fn().mockResolvedValue(undefined),
  };

  const controller = new WebhookController(
    mockWhatsapp as any,
    mockConfig as any,
    mockCredentials as any,
    mockDb as any,
    mockQueue as any,
  );

  return { controller, mockCredentials, mockConfig };
}

function generateSignature(body: Buffer, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

describe('WebhookController — HMAC signature validation', () => {
  it('should accept a valid signature', async () => {
    const { controller } = createController();
    const payload = { entry: [] };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const validSignature = generateSignature(rawBody, APP_SECRET);

    const req = { rawBody } as any;
    const result = await controller.handleIncoming(payload, req, validSignature);
    expect(result).toBe('EVENT_RECEIVED');
  });

  it('should reject an invalid signature with ForbiddenException', async () => {
    const { controller } = createController();
    const payload = { entry: [] };
    const rawBody = Buffer.from(JSON.stringify(payload));

    const req = { rawBody } as any;
    await expect(
      controller.handleIncoming(payload, req, 'sha256=invalid_signature_value'),
    ).rejects.toThrow('Invalid signature');
  });

  it('should reject when signature header is missing', async () => {
    const { controller } = createController();
    const payload = { entry: [] };
    const rawBody = Buffer.from(JSON.stringify(payload));

    const req = { rawBody } as any;
    await expect(
      controller.handleIncoming(payload, req, undefined),
    ).rejects.toThrow('Missing X-Hub-Signature-256 header');
  });

  it('should skip validation when app_secret is not configured', async () => {
    const { controller, mockCredentials, mockConfig } = createController('');
    mockCredentials.getWhatsAppCredentials.mockResolvedValue({
      accessToken: 'token',
      phoneNumberId: 'phone-id',
      verifyToken: 'verify-token',
      appSecret: '',
    });
    mockConfig.get.mockReturnValue(undefined);

    const payload = { entry: [] };
    const req = { rawBody: Buffer.from(JSON.stringify(payload)) } as any;

    const result = await controller.handleIncoming(payload, req, undefined);
    expect(result).toBe('EVENT_RECEIVED');
  });
});

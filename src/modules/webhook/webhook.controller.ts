import { Controller, Get, Post, Query, Body, Req, Headers, Res, Logger, HttpCode, HttpStatus, ForbiddenException } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { CredentialService } from '../credentials/credential.service';
import { DatabaseService } from '../database/database.service';
import { webhookQueue } from '../database/schema/webhook-queue.schema';
import { WEBHOOK_QUEUE } from '../queue/queue.module';
import type { WebhookJobData } from './webhook.processor';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly config: ConfigService,
    private readonly credentials: CredentialService,
    private readonly db: DatabaseService,
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue,
  ) {}

  @Get()
  async verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const creds = await this.credentials.getWhatsAppCredentials();
    const result = this.whatsapp.verifyWebhook(mode, token, challenge, creds.verifyToken);

    if (result !== false) {
      this.logger.log('Webhook verified');
      void reply.status(200).send(result);
    } else {
      this.logger.warn('Webhook verification failed');
      void reply.status(403).send('Forbidden');
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleIncoming(
    @Body() payload: Record<string, unknown>,
    @Req() req: FastifyRequest & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature?: string,
  ): Promise<string> {
    await this.validateSignature(req.rawBody, signature);

    const parsed = this.whatsapp.parseWebhookPayload(payload);
    if (!parsed) {
      return 'EVENT_RECEIVED';
    }

    this.logger.log(`Incoming message from=${parsed.from} type=${parsed.type}`);

    let dbQueueId: number | undefined;
    try {
      const result = await this.db.db.insert(webhookQueue).values({
        messageId: parsed.messageId,
        phoneNumber: parsed.from,
        contactName: parsed.contactName,
        messageType: parsed.type,
        messageText: parsed.text || null,
        audioId: parsed.audioId ?? null,
        rawPayload: payload,
        status: 'pending',
      });
      dbQueueId = Number(result[0].insertId);
    } catch (error: unknown) {
      this.logger.warn('Failed to persist queue entry', error instanceof Error ? error.message : '');
    }

    const jobData: WebhookJobData = {
      messageId: parsed.messageId,
      from: parsed.from,
      contactName: parsed.contactName,
      text: parsed.text,
      type: parsed.type,
      audioId: parsed.audioId,
      mimeType: parsed.mimeType,
      timestamp: parsed.timestamp,
      rawPayload: payload,
      dbQueueId,
    };

    await this.queue.add('process-message', jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });

    return 'EVENT_RECEIVED';
  }

  private async validateSignature(rawBody: Buffer | undefined, signature: string | undefined): Promise<void> {
    let appSecret: string | undefined;
    try {
      const creds = await this.credentials.getWhatsAppCredentials();
      appSecret = creds.appSecret;
    } catch {
      appSecret = this.config.get<string>('whatsapp.appSecret');
    }

    if (!appSecret) {
      this.logger.warn('app_secret not configured — skipping webhook signature validation (dev mode)');
      return;
    }

    if (!signature) {
      throw new ForbiddenException('Missing X-Hub-Signature-256 header');
    }

    if (!rawBody) {
      this.logger.warn('Raw body not available — skipping signature validation');
      return;
    }

    const expectedSig = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSig);

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      this.logger.warn('Webhook signature mismatch');
      throw new ForbiddenException('Invalid signature');
    }
  }
}

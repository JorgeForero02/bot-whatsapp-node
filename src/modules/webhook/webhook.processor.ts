import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { OpenAIService } from '../openai/openai.service';
import { ConversationService } from '../conversation/conversation.service';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../queue/redis.service';
import { SettingsService } from '../settings/settings.service';
import { HandoffStrategy } from './strategies/handoff.strategy';
import { CalendarStrategy } from './strategies/calendar.strategy';
import { AiStrategy } from './strategies/ai.strategy';
import { ClassicStrategy } from './strategies/classic.strategy';
import { MessageContext } from './strategies/message-processing.strategy';
import { webhookQueue } from '../database/schema/webhook-queue.schema';
import { messages } from '../database/schema/messages.schema';

const HUMAN_KEYWORDS = [
  'hablar con humano', 'hablar con una persona', 'hablar con operador',
  'quiero un humano', 'atención humana', 'operador', 'agente humano',
  'hablar con alguien', 'persona real', 'representante',
];

const UNSUPPORTED_MEDIA_TYPES = ['image', 'video', 'document', 'sticker', 'location', 'contacts'];

export interface WebhookJobData {
  messageId: string;
  from: string;
  contactName: string;
  text: string;
  type: string;
  audioId?: string;
  mimeType?: string;
  timestamp: number;
  rawPayload: Record<string, unknown>;
  dbQueueId?: number;
}

@Processor('webhook-queue', { concurrency: 40 })
export class WebhookQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookQueueProcessor.name);

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly openai: OpenAIService,
    private readonly conversation: ConversationService,
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
    private readonly handoffStrategy: HandoffStrategy,
    private readonly calendarStrategy: CalendarStrategy,
    private readonly aiStrategy: AiStrategy,
    private readonly classicStrategy: ClassicStrategy,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const data = job.data;
    const phone = data.from;
    const jobId = job.id ?? 'unknown';
    const lockKey = `lock:phone:${phone}`;
    let lockAcquired = false;

    try {
      lockAcquired = await this.redis.acquireLock(lockKey, jobId, 60);
      if (!lockAcquired) {
        this.logger.warn(`Phone ${phone} locked, job ${jobId} will retry`);
        await job.moveToDelayed(Date.now() + 2000, job.token);
        return;
      }

      this.logger.log(`Processing job ${job.id} from=${data.from} type=${data.type}`);

      if (data.dbQueueId) {
        await this.updateQueueStatus(data.dbQueueId, 'processing');
      }

      const botMode = await this.settings.get('bot_mode', 'ai');

      if (UNSUPPORTED_MEDIA_TYPES.includes(data.type)) {
        const conv = await this.conversation.getOrCreateConversation(data.from, data.contactName);
        const mediaMsg = 'Lo siento, por el momento solo puedo procesar mensajes de *texto*. Por favor, envíame tu consulta en un mensaje de texto.';
        await this.conversation.addMessage(conv.id, 'bot', mediaMsg);
        await this.whatsapp.sendMessage(data.from, mediaMsg);
        if (data.dbQueueId) await this.updateQueueStatus(data.dbQueueId, 'completed');
        return;
      }

      if (data.type === 'audio' && data.audioId) {
        if (botMode === 'classic') {
          const conv = await this.conversation.getOrCreateConversation(data.from, data.contactName);
          const audioMsg = 'Lo siento, en este modo solo puedo procesar mensajes de *texto*. Por favor, escribe tu consulta.';
          await this.conversation.addMessage(conv.id, 'bot', audioMsg);
          await this.whatsapp.sendMessage(data.from, audioMsg);
          if (data.dbQueueId) await this.updateQueueStatus(data.dbQueueId, 'completed');
          return;
        }
      }

      let userText = data.text;

      if (data.type === 'audio' && data.audioId) {
        try {
          const audioContent = await this.whatsapp.downloadMedia(data.audioId);
          userText = '[Audio] ' + await this.openai.transcribeAudio(audioContent);
          this.logger.log(`Transcribed audio: ${userText.substring(0, 50)}...`);
        } catch (error: unknown) {
          this.logger.error('Audio transcription failed', error instanceof Error ? error.message : '');
          await this.whatsapp.sendMessage(
            data.from,
            'Lo siento, no pude procesar el audio. Por favor, envía un mensaje de texto.',
          );
          if (data.dbQueueId) await this.updateQueueStatus(data.dbQueueId, 'failed', 'Audio transcription failed');
          return;
        }
      }

      if (!userText || userText.trim().length === 0) {
        if (data.dbQueueId) await this.updateQueueStatus(data.dbQueueId, 'completed');
        return;
      }

      const conv = await this.conversation.getOrCreateConversation(
        data.from,
        data.contactName,
      );

      try {
        const profileKey = `user:profile:${data.from}`;
        const cached = await this.redis.getClient().get(profileKey);
        if (!cached) {
          const profile = JSON.stringify({
            phoneNumber: conv.phoneNumber,
            contactName: conv.contactName ?? data.contactName ?? 'Unknown',
            conversationId: conv.id,
            status: conv.status,
          });
          await this.redis.getClient().set(profileKey, profile, 'EX', 1800);
        }
      } catch { }

      if (data.messageId) {
        try {
          const existingMsg = await this.db.db
            .select({ id: messages.id })
            .from(messages)
            .where(eq(messages.messageId, data.messageId))
            .limit(1);
          if (existingMsg.length > 0) {
            this.logger.log(`Duplicate message_id ${data.messageId}, skipping`);
            if (data.dbQueueId) await this.updateQueueStatus(data.dbQueueId, 'completed');
            return;
          }
        } catch { }
      }

      await this.conversation.addMessage(conv.id, 'user', userText, {
        messageId: data.messageId,
        mediaType: data.type as 'text' | 'audio',
      });

      await this.whatsapp.markAsRead(data.messageId);

      const context: MessageContext = {
        from: data.from,
        userText,
        conversationId: conv.id,
        contactName: data.contactName,
      };

      if (this.isRequestingHuman(userText)) {
        await this.handoffStrategy.process(context);
        if (data.dbQueueId) await this.updateQueueStatus(data.dbQueueId, 'completed');
        return;
      }

      if (conv.status === 'pending_human') {
        this.logger.log(`Conversation ${conv.id} pending human, skipping`);
        if (data.dbQueueId) await this.updateQueueStatus(data.dbQueueId, 'completed');
        return;
      }

      if (botMode === 'classic') {
        await this.classicStrategy.process(context);
      } else {
        if (!conv.aiEnabled) {
          this.logger.log(`AI disabled for conversation ${conv.id}, skipping`);
          if (data.dbQueueId) await this.updateQueueStatus(data.dbQueueId, 'completed');
          return;
        }
        const calendarResult = await this.calendarStrategy.process(context);
        if (!calendarResult.handled) {
          await this.aiStrategy.process(context);
        }
      }

      if (data.dbQueueId) await this.updateQueueStatus(data.dbQueueId, 'completed');
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Job ${job.id} failed: ${errorMsg}`);
      if (data.dbQueueId) await this.updateQueueStatus(data.dbQueueId, 'failed', errorMsg);
      throw error;
    } finally {
      if (lockAcquired) {
        await this.redis.releaseLock(lockKey);
      }
    }
  }

  private isRequestingHuman(text: string): boolean {
    const lower = text.toLowerCase();
    return HUMAN_KEYWORDS.some((kw) => lower.includes(kw));
  }

  private async updateQueueStatus(
    queueId: number,
    status: 'processing' | 'completed' | 'failed',
    errorMessage?: string,
  ): Promise<void> {
    try {
      const updateData: Record<string, unknown> = { status };
      if (status === 'processing') {
        updateData['startedAt'] = new Date();
      }
      if (status === 'completed' || status === 'failed') {
        updateData['completedAt'] = new Date();
      }
      if (errorMessage) {
        updateData['errorMessage'] = errorMessage;
      }
      await this.db.db
        .update(webhookQueue)
        .set(updateData)
        .where(eq(webhookQueue.id, queueId));
    } catch (error: unknown) {
      this.logger.error('Failed to update queue status', error instanceof Error ? error.message : '');
    }
  }
}

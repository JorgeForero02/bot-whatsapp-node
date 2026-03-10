import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter as BullBoardFastifyAdapter } from '@bull-board/fastify';
import { WebhookQueueProcessor } from '../webhook/webhook.processor';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { OpenAIModule } from '../openai/openai.module';
import { ConversationModule } from '../conversation/conversation.module';
import { RagModule } from '../rag/rag.module';
import { CalendarModule } from '../calendar/calendar.module';
import { ClassicBotModule } from '../classic-bot/classic-bot.module';
import { RedisService } from './redis.service';
import { DatabaseService } from '../database/database.service';
import { webhookQueue } from '../database/schema/webhook-queue.schema';
import { eq, and, lt } from 'drizzle-orm';

export const WEBHOOK_QUEUE = 'webhook-queue';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('redis.url') ?? 'redis://localhost:6379',
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
        prefix: 'bull',
      }),
    }),
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: BullBoardFastifyAdapter,
    }),
    BullBoardModule.forFeature({
      name: WEBHOOK_QUEUE,
      adapter: BullMQAdapter,
    }),
    WhatsAppModule,
    OpenAIModule,
    ConversationModule,
    RagModule,
    CalendarModule,
    ClassicBotModule,
  ],
  providers: [WebhookQueueProcessor, RedisService],
  exports: [BullModule, RedisService],
})
export class QueueModule implements OnModuleInit {
  private readonly logger = new Logger(QueueModule.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    @InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.cleanupStaleJobs();
    await this.configureWorkerConcurrency();
  }

  private async configureWorkerConcurrency(): Promise<void> {
    try {
      await this.webhookQueue.setGlobalConcurrency(20);
      this.logger.log('Worker concurrency set to 20');
    } catch (error: unknown) {
      this.logger.error('Failed to set worker concurrency', error instanceof Error ? error.message : '');
    }
  }

  private async cleanupStaleJobs(): Promise<void> {
    try {
      const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
      const result = await this.db.db
        .update(webhookQueue)
        .set({ status: 'failed', errorMessage: 'Stale on startup', completedAt: new Date() })
        .where(and(eq(webhookQueue.status, 'processing'), lt(webhookQueue.startedAt, staleThreshold)));
      const affected = (result[0] as { affectedRows?: number }).affectedRows ?? 0;
      if (affected > 0) {
        this.logger.log(`Cleaned up ${affected} stale queue items on startup`);
      }
    } catch (error: unknown) {
      this.logger.error('Failed to clean up stale jobs', error instanceof Error ? error.message : '');
    }
  }
}

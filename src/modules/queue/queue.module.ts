import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
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

export const WEBHOOK_QUEUE = 'webhook-queue';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('redis.url') ?? 'redis://localhost:6379',
        },
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
  providers: [WebhookQueueProcessor],
  exports: [BullModule],
})
export class QueueModule {}

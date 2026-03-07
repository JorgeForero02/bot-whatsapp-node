import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [WhatsAppModule, QueueModule],
  controllers: [WebhookController],
})
export class WebhookModule {}

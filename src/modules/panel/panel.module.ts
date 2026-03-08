import { Module } from '@nestjs/common';
import { PanelController } from './panel.controller';
import { ViewController } from './view.controller';
import { ConversationModule } from '../conversation/conversation.module';
import { DocumentsModule } from '../documents/documents.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { ClassicBotModule } from '../classic-bot/classic-bot.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { CalendarModule } from '../calendar/calendar.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [ConversationModule, DocumentsModule, OnboardingModule, ClassicBotModule, WhatsAppModule, CalendarModule, QueueModule],
  controllers: [PanelController, ViewController],
})
export class PanelModule {}

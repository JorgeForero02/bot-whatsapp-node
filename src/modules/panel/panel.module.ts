import { Module } from '@nestjs/common';
import { ApiAuthGuard } from '../../common/guards/api-auth.guard';
import { HttpModule } from '@nestjs/axios';
import { ViewController } from './view.controller';
import { ApiConversationController } from './api-conversation.controller';
import { ApiDocumentController } from './api-document.controller';
import { ApiCredentialsController } from './api-credentials.controller';
import { ApiFlowController } from './api-flow.controller';
import { ApiSettingsController } from './api-settings.controller';
import { ConversationModule } from '../conversation/conversation.module';
import { DocumentsModule } from '../documents/documents.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { ClassicBotModule } from '../classic-bot/classic-bot.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { CalendarModule } from '../calendar/calendar.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [HttpModule, ConversationModule, DocumentsModule, OnboardingModule, ClassicBotModule, WhatsAppModule, CalendarModule, QueueModule],
  controllers: [ApiConversationController, ApiDocumentController, ApiCredentialsController, ApiFlowController, ApiSettingsController, ViewController],
  providers: [ApiAuthGuard],
})
export class PanelModule {}

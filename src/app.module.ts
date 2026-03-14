import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { DatabaseModule } from './modules/database/database.module';
import { EncryptionModule } from './modules/encryption/encryption.module';
import { StorageModule } from './modules/storage/storage.module';
import { CredentialsModule } from './modules/credentials/credentials.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { OpenAIModule } from './modules/openai/openai.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { RagModule } from './modules/rag/rag.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { ClassicBotModule } from './modules/classic-bot/classic-bot.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { PanelModule } from './modules/panel/panel.module';
import { SettingsModule } from './modules/settings/settings.module';
import { OnboardingGuard } from './common/guards/onboarding.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = process.env.NODE_ENV === 'production' || config.get<string>('app.nodeEnv') === 'production';
        return {
          pinoHttp: {
            level: isProd ? 'warn' : 'debug',
            autoLogging: !isProd,
            customSuccessMessage: () => '',
            customErrorMessage: () => '',
            ...(isProd ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
          },
        };
      },
    }),
    DatabaseModule,
    SettingsModule,
    EncryptionModule,
    StorageModule,
    CredentialsModule,
    WhatsAppModule,
    OpenAIModule,
    ConversationModule,
    RagModule,
    DocumentsModule,
    OnboardingModule,
    CalendarModule,
    ClassicBotModule,
    WebhookModule,
    PanelModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: OnboardingGuard },
  ],
})
export class AppModule {}

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from './database.service';

const DEFAULT_SETTINGS: Array<{ key: string; value: string; type: 'text' | 'boolean' | 'json' }> = [
  { key: 'bot_name',                value: 'WhatsApp Bot',                                                                                      type: 'text' },
  { key: 'bot_greeting',            value: 'Hola! Soy un asistente virtual. ¿En qué puedo ayudarte?',                                          type: 'text' },
  { key: 'bot_fallback_message',    value: 'Lo siento, no encontré información relevante. Un operador humano te atenderá pronto.',              type: 'text' },
  { key: 'human_handoff_enabled',   value: 'true',                                                                                              type: 'boolean' },
  { key: 'openai_status',           value: 'active',                                                                                            type: 'text' },
  { key: 'openai_last_error',       value: '',                                                                                                   type: 'text' },
  { key: 'openai_error_timestamp',  value: '',                                                                                                   type: 'text' },
  { key: 'system_prompt',           value: 'Eres un asistente virtual inteligente y profesional especializado en atención al cliente.\n\nCAPACIDADES PRINCIPALES:\n\n1. Información General: Responde preguntas sobre servicios, productos y consultas generales usando tu base de conocimientos.\n\n2. Base de Conocimientos RAG: Usa documentos cargados en el sistema para dar respuestas precisas y actualizadas.\n\nTONO Y ESTILO:\n\nProfesional pero cercano, respuestas concisas y directas, siempre confirma las acciones realizadas.', type: 'text' },
  { key: 'bot_mode',                value: 'ai',                                                                                                 type: 'text' },
  { key: 'context_messages_count',  value: '5',                                                                                                  type: 'text' },
  { key: 'business_name',           value: 'Mi Negocio',                                                                                        type: 'text' },
  { key: 'timezone',                value: 'America/Bogota',                                                                                     type: 'text' },
  { key: 'welcome_message',         value: 'Hola! Soy un asistente virtual. ¿En qué puedo ayudarte?',                                          type: 'text' },
  { key: 'fallback_message',        value: 'Lo siento, no encontré información relevante. Un operador humano te atenderá pronto.',              type: 'text' },
  { key: 'calendar_enabled',        value: 'false',                                                                                              type: 'boolean' },
  { key: 'confidence_threshold',    value: '0.7',                                                                                                type: 'text' },
  { key: 'max_results',             value: '5',                                                                                                  type: 'text' },
  { key: 'chunk_size',              value: '1000',                                                                                               type: 'text' },
  { key: 'auto_reply',              value: 'true',                                                                                               type: 'boolean' },
  { key: 'temperature',             value: '0.7',                                                                                                type: 'text' },
  { key: 'timeout',                 value: '30',                                                                                                 type: 'text' },
  { key: 'openai_model',            value: 'gpt-3.5-turbo',                                                                                      type: 'text' },
  { key: 'openai_embedding_model',  value: 'text-embedding-ada-002',                                                                             type: 'text' },
];

const DEFAULT_CALENDAR_SETTINGS: Array<{ key: string; value: string }> = [
  { key: 'timezone',                  value: 'America/Bogota' },
  { key: 'default_duration_minutes',  value: '60' },
  { key: 'max_events_per_day',        value: '10' },
  { key: 'min_advance_hours',         value: '1' },
  { key: 'business_hours_monday',     value: '{"enabled":true,"start":"09:00","end":"18:00"}' },
  { key: 'business_hours_tuesday',    value: '{"enabled":true,"start":"09:00","end":"18:00"}' },
  { key: 'business_hours_wednesday',  value: '{"enabled":true,"start":"09:00","end":"18:00"}' },
  { key: 'business_hours_thursday',   value: '{"enabled":true,"start":"09:00","end":"18:00"}' },
  { key: 'business_hours_friday',     value: '{"enabled":true,"start":"09:00","end":"18:00"}' },
  { key: 'business_hours_saturday',   value: '{"enabled":true,"start":"10:00","end":"14:00"}' },
  { key: 'business_hours_sunday',     value: '{"enabled":false,"start":"09:00","end":"18:00"}' },
  { key: 'reminder_email_enabled',    value: 'true' },
  { key: 'reminder_email_minutes',    value: '1440' },
  { key: 'reminder_popup_enabled',    value: 'true' },
  { key: 'reminder_popup_minutes',    value: '30' },
];

@Injectable()
export class DatabaseSeedService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseSeedService.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedSettings();
      this.logger.log('Settings seeded');
      await this.seedCalendarSettings();
      this.logger.log('Calendar settings seeded');
      await this.seedBotCredentials();
      this.logger.log('Bot credentials row ensured');
      await this.seedGoogleCredentials();
      this.logger.log('Google credentials row ensured');
    } catch (err: unknown) {
      this.logger.error('Seed failed — did you run drizzle-kit push first?', err instanceof Error ? err.message : String(err));
    }
  }

  private async seedSettings(): Promise<void> {
    for (const s of DEFAULT_SETTINGS) {
      await this.db.db.execute(
        sql`INSERT INTO settings (setting_key, setting_value, setting_type)
            VALUES (${s.key}, ${s.value}, ${s.type})
            ON DUPLICATE KEY UPDATE setting_key = setting_key`,
      );
    }
  }

  private async seedCalendarSettings(): Promise<void> {
    for (const s of DEFAULT_CALENDAR_SETTINGS) {
      await this.db.db.execute(
        sql`INSERT INTO calendar_settings (setting_key, setting_value)
            VALUES (${s.key}, ${s.value})
            ON DUPLICATE KEY UPDATE setting_key = setting_key`,
      );
    }
  }

  private async seedBotCredentials(): Promise<void> {
    await this.db.db.execute(
      sql`INSERT INTO bot_credentials (id) VALUES (1)
          ON DUPLICATE KEY UPDATE id = 1`,
    );
  }

  private async seedGoogleCredentials(): Promise<void> {
    await this.db.db.execute(
      sql`INSERT INTO google_oauth_credentials (id) VALUES (1)
          ON DUPLICATE KEY UPDATE id = 1`,
    );
  }
}

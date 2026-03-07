import { mysqlTable, int, text, timestamp } from 'drizzle-orm/mysql-core';

export const botCredentials = mysqlTable('bot_credentials', {
  id: int('id').primaryKey().autoincrement(),
  whatsappAccessToken: text('whatsapp_access_token'),
  whatsappPhoneNumberId: text('whatsapp_phone_number_id'),
  whatsappVerifyToken: text('whatsapp_verify_token'),
  whatsappAppSecret: text('whatsapp_app_secret'),
  openaiApiKey: text('openai_api_key'),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

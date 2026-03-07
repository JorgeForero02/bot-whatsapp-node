import { mysqlTable, int, text, timestamp } from 'drizzle-orm/mysql-core';

export const googleOauthCredentials = mysqlTable('google_oauth_credentials', {
  id: int('id').primaryKey().autoincrement(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  clientId: text('client_id'),
  clientSecret: text('client_secret'),
  calendarId: text('calendar_id'),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

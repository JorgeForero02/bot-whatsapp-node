import { mysqlTable, int, varchar, text, timestamp, uniqueIndex } from 'drizzle-orm/mysql-core';

export const classicCalendarSessions = mysqlTable(
  'classic_calendar_sessions',
  {
    id: int('id').primaryKey().autoincrement(),
    userPhone: varchar('user_phone', { length: 50 }).notNull(),
    step: varchar('step', { length: 50 }).notNull(),
    data: text('data'),
    expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex('unique_user_phone').on(table.userPhone),
  ],
);

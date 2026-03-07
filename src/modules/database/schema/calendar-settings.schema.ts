import { mysqlTable, int, varchar, text, timestamp, uniqueIndex } from 'drizzle-orm/mysql-core';

export const calendarSettings = mysqlTable(
  'calendar_settings',
  {
    id: int('id').primaryKey().autoincrement(),
    settingKey: varchar('setting_key', { length: 100 }).notNull(),
    settingValue: text('setting_value').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex('setting_key').on(table.settingKey),
  ],
);

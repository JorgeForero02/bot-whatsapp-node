import { mysqlTable, int, varchar, text, timestamp, mysqlEnum, uniqueIndex } from 'drizzle-orm/mysql-core';

export const settings = mysqlTable(
  'settings',
  {
    id: int('id').primaryKey().autoincrement(),
    settingKey: varchar('setting_key', { length: 100 }).notNull(),
    settingType: mysqlEnum('setting_type', ['text', 'boolean', 'json']).default('text'),
    settingValue: text('setting_value').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex('setting_key').on(table.settingKey),
  ],
);

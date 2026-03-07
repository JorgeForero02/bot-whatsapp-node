import { mysqlTable, int, varchar, boolean, timestamp, uniqueIndex, index, mysqlEnum } from 'drizzle-orm/mysql-core';

export const conversations = mysqlTable(
  'conversations',
  {
    id: int('id').primaryKey().autoincrement(),
    phoneNumber: varchar('phone_number', { length: 50 }).notNull(),
    contactName: varchar('contact_name', { length: 255 }),
    status: mysqlEnum('status', ['active', 'closed', 'pending_human']).default('active'),
    aiEnabled: boolean('ai_enabled').default(true),
    lastMessageAt: timestamp('last_message_at').defaultNow(),
    lastBotMessageAt: timestamp('last_bot_message_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex('unique_phone').on(table.phoneNumber),
    index('idx_status').on(table.status),
    index('idx_last_message').on(table.lastMessageAt),
    index('idx_conversations_phone_status').on(table.phoneNumber, table.status),
  ],
);

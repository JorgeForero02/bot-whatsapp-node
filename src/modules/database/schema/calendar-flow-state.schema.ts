import { mysqlTable, int, varchar, text, timestamp, index, uniqueIndex } from 'drizzle-orm/mysql-core';
import { conversations } from './conversations.schema';

export const calendarFlowState = mysqlTable(
  'calendar_flow_state',
  {
    id: int('id').primaryKey().autoincrement(),
    userPhone: varchar('user_phone', { length: 50 }).notNull(),
    conversationId: int('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    currentStep: varchar('current_step', { length: 50 }).notNull(),
    extractedDate: varchar('extracted_date', { length: 20 }),
    extractedTime: varchar('extracted_time', { length: 10 }),
    extractedService: varchar('extracted_service', { length: 255 }),
    eventTitle: varchar('event_title', { length: 255 }),
    cancelEventsJson: text('cancel_events_json'),
    attempts: int('attempts').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
    expiresAt: timestamp('expires_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('unique_phone').on(table.userPhone),
    index('idx_expires').on(table.expiresAt),
  ],
);

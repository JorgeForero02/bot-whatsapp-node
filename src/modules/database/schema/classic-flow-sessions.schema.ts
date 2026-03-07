import { mysqlTable, int, varchar, timestamp, uniqueIndex } from 'drizzle-orm/mysql-core';

export const classicFlowSessions = mysqlTable(
  'classic_flow_sessions',
  {
    id: int('id').primaryKey().autoincrement(),
    userPhone: varchar('user_phone', { length: 50 }).notNull(),
    currentNodeId: int('current_node_id'),
    attempts: int('attempts').default(0),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => [
    uniqueIndex('unique_user_phone').on(table.userPhone),
  ],
);

import { mysqlTable, int, varchar, text, boolean, json, index } from 'drizzle-orm/mysql-core';

export const flowNodes = mysqlTable(
  'flow_nodes',
  {
    id: int('id').primaryKey().autoincrement(),
    name: varchar('name', { length: 255 }).notNull(),
    triggerKeywords: json('trigger_keywords').notNull().$type<string[]>(),
    messageText: text('message_text').notNull(),
    nextNodeId: int('next_node_id'),
    isRoot: boolean('is_root').default(false),
    requiresCalendar: boolean('requires_calendar').default(false),
    matchAnyInput: boolean('match_any_input').default(false),
    isFarewell: boolean('is_farewell').default(false),
    positionOrder: int('position_order').default(0),
    isActive: boolean('is_active').default(true),
  },
  (table) => [
    index('idx_is_root').on(table.isRoot),
    index('idx_is_active').on(table.isActive),
    index('idx_position').on(table.positionOrder),
  ],
);

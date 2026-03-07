import { mysqlTable, int, varchar, json, index } from 'drizzle-orm/mysql-core';
import { flowNodes } from './flow-nodes.schema';

export const flowOptions = mysqlTable(
  'flow_options',
  {
    id: int('id').primaryKey().autoincrement(),
    nodeId: int('node_id')
      .notNull()
      .references(() => flowNodes.id, { onDelete: 'cascade' }),
    optionText: varchar('option_text', { length: 255 }).notNull(),
    optionKeywords: json('option_keywords').notNull().$type<string[]>(),
    nextNodeId: int('next_node_id'),
    positionOrder: int('position_order').default(0),
  },
  (table) => [
    index('idx_node').on(table.nodeId),
    index('idx_position').on(table.positionOrder),
  ],
);

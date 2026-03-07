import { mysqlTable, int, text, varbinary, timestamp, index } from 'drizzle-orm/mysql-core';
import { documents } from './documents.schema';

export const vectors = mysqlTable(
  'vectors',
  {
    id: int('id').primaryKey().autoincrement(),
    documentId: int('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    chunkText: text('chunk_text').notNull(),
    chunkIndex: int('chunk_index').notNull(),
    embedding: varbinary('embedding', { length: 8192 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_document').on(table.documentId),
    index('idx_created').on(table.createdAt),
  ],
);

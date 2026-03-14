import { mysqlTable, int, varchar, text, smallint, timestamp, index, customType } from 'drizzle-orm/mysql-core';
import { documents } from './documents.schema';

const blobColumn = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return 'blob'; },
  toDriver(val) { return val; },
  fromDriver(val) { return Buffer.isBuffer(val) ? val : Buffer.from(val); },
});

export const vectors = mysqlTable(
  'vectors',
  {
    id: int('id').primaryKey().autoincrement(),
    documentId: int('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    chunkText: text('chunk_text').notNull(),
    chunkIndex: int('chunk_index').notNull(),
    embedding: blobColumn('embedding').notNull(),
    embeddingModel: varchar('embedding_model', { length: 100 }).notNull().default('text-embedding-ada-002'),
    embeddingDimensions: smallint('embedding_dimensions').notNull().default(1536),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_document').on(table.documentId),
    index('idx_created').on(table.createdAt),
    index('idx_embedding_model').on(table.embeddingModel),
  ],
);

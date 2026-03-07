import { mysqlTable, int, varchar, text, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/mysql-core';

export const documents = mysqlTable(
  'documents',
  {
    id: int('id').primaryKey().autoincrement(),
    filename: varchar('filename', { length: 255 }).notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    fileType: varchar('file_type', { length: 50 }).notNull(),
    contentText: text('content_text').notNull(),
    chunkCount: int('chunk_count').default(0),
    fileSize: int('file_size').notNull(),
    fileHash: varchar('file_hash', { length: 32 }),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  },
  (table) => [
    index('idx_created').on(table.createdAt),
    index('idx_file_type').on(table.fileType),
    index('idx_is_active').on(table.isActive),
    uniqueIndex('idx_file_hash').on(table.fileHash),
  ],
);

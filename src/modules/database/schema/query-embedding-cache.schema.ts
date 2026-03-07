import { mysqlTable, int, varchar, varbinary, timestamp, uniqueIndex, index } from 'drizzle-orm/mysql-core';

export const queryEmbeddingCache = mysqlTable(
  'query_embedding_cache',
  {
    id: int('id').primaryKey().autoincrement(),
    queryHash: varchar('query_hash', { length: 32 }).notNull(),
    embedding: varbinary('embedding', { length: 8192 }).notNull(),
    hitCount: int('hit_count').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    lastUsedAt: timestamp('last_used_at').defaultNow(),
  },
  (table) => [
    uniqueIndex('unique_hash').on(table.queryHash),
    index('idx_last_used').on(table.lastUsedAt),
  ],
);

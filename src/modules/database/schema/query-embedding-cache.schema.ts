import { mysqlTable, int, varchar, timestamp, uniqueIndex, index, customType } from 'drizzle-orm/mysql-core';

const blobColumn = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return 'blob'; },
  toDriver(val) { return val; },
  fromDriver(val) { return Buffer.isBuffer(val) ? val : Buffer.from(val); },
});

export const queryEmbeddingCache = mysqlTable(
  'query_embedding_cache',
  {
    id: int('id').primaryKey().autoincrement(),
    queryHash: varchar('query_hash', { length: 32 }).notNull(),
    embedding: blobColumn('embedding').notNull(),
    hitCount: int('hit_count').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    lastUsedAt: timestamp('last_used_at').defaultNow(),
  },
  (table) => [
    uniqueIndex('unique_hash').on(table.queryHash),
    index('idx_last_used').on(table.lastUsedAt),
  ],
);

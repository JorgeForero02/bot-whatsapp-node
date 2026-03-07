import { mysqlTable, bigint, varchar, text, tinyint, timestamp, index, uniqueIndex, json, mysqlEnum } from 'drizzle-orm/mysql-core';

export const webhookQueue = mysqlTable(
  'webhook_queue',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).primaryKey().autoincrement(),
    messageId: varchar('message_id', { length: 255 }).notNull(),
    phoneNumber: varchar('phone_number', { length: 50 }).notNull(),
    contactName: varchar('contact_name', { length: 255 }).default(''),
    messageType: varchar('message_type', { length: 20 }).default('text'),
    messageText: text('message_text'),
    audioId: varchar('audio_id', { length: 255 }),
    rawPayload: json('raw_payload').notNull(),
    status: mysqlEnum('status', ['pending', 'processing', 'completed', 'failed']).default('pending'),
    attempts: tinyint('attempts', { unsigned: true }).default(0),
    maxAttempts: tinyint('max_attempts', { unsigned: true }).default(3),
    createdAt: timestamp('created_at').defaultNow(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    errorMessage: text('error_message'),
  },
  (table) => [
    uniqueIndex('uk_message_id').on(table.messageId),
    index('idx_status_created').on(table.status, table.createdAt),
    index('idx_phone').on(table.phoneNumber),
    index('idx_webhook_status_phone').on(table.status, table.phoneNumber),
    index('idx_webhook_created_status').on(table.createdAt, table.status),
  ],
);

import { mysqlTable, int, varchar, text, float, timestamp, index, mysqlEnum } from 'drizzle-orm/mysql-core';
import { conversations } from './conversations.schema';

export const messages = mysqlTable(
  'messages',
  {
    id: int('id').primaryKey().autoincrement(),
    conversationId: int('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    messageId: varchar('message_id', { length: 255 }),
    senderType: mysqlEnum('sender_type', ['user', 'bot', 'human']).notNull(),
    messageText: text('message_text').notNull(),
    audioUrl: varchar('audio_url', { length: 512 }),
    mediaType: mysqlEnum('media_type', ['text', 'audio', 'image', 'video', 'document']).default('text'),
    contextUsed: text('context_used'),
    confidenceScore: float('confidence_score'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('idx_conversation').on(table.conversationId),
    index('idx_created').on(table.createdAt),
    index('idx_sender').on(table.senderType),
    index('idx_message_id').on(table.messageId),
    index('idx_messages_conversation_created').on(table.conversationId, table.createdAt),
  ],
);

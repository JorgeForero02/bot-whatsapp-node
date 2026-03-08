import { Injectable, Logger } from '@nestjs/common';
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { conversations } from '../database/schema/conversations.schema';
import { messages } from '../database/schema/messages.schema';

export interface ConversationRow {
  id: number;
  phoneNumber: string;
  contactName: string | null;
  status: string | null;
  aiEnabled: boolean | null;
  lastMessageAt: Date | null;
  lastBotMessageAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface MessageRow {
  id: number;
  conversationId: number;
  messageId: string | null;
  senderType: string;
  messageText: string;
  audioUrl: string | null;
  mediaType: string | null;
  contextUsed: string | null;
  confidenceScore: number | null;
  createdAt: Date | null;
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(private readonly db: DatabaseService) {}

  async getOrCreateConversation(phoneNumber: string, contactName = 'Unknown'): Promise<ConversationRow> {
    const existing = await this.db.db
      .select()
      .from(conversations)
      .where(eq(conversations.phoneNumber, phoneNumber))
      .limit(1);

    if (existing.length > 0) {
      if (contactName && contactName !== 'Unknown' && existing[0].contactName !== contactName) {
        await this.db.db
          .update(conversations)
          .set({ contactName })
          .where(eq(conversations.id, existing[0].id));
      }
      return existing[0] as ConversationRow;
    }

    const result = await this.db.db.insert(conversations).values({
      phoneNumber,
      contactName,
      status: 'active',
      aiEnabled: true,
    });

    const insertId = Number(result[0].insertId);
    const created = await this.db.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, insertId))
      .limit(1);

    return created[0] as ConversationRow;
  }

  async addMessage(
    conversationId: number,
    senderType: 'user' | 'bot' | 'human',
    messageText: string,
    extra: {
      messageId?: string;
      audioUrl?: string;
      mediaType?: 'text' | 'audio' | 'image' | 'video' | 'document';
      contextUsed?: string;
      confidenceScore?: number;
    } = {},
  ): Promise<number> {
    const result = await this.db.db.insert(messages).values({
      conversationId,
      senderType,
      messageText,
      messageId: extra.messageId ?? null,
      audioUrl: extra.audioUrl ?? null,
      mediaType: extra.mediaType ?? 'text',
      contextUsed: extra.contextUsed ?? null,
      confidenceScore: extra.confidenceScore ?? null,
    });

    const updateData: Record<string, unknown> = {
      lastMessageAt: new Date(),
    };
    if (senderType === 'bot') {
      updateData['lastBotMessageAt'] = new Date();
    }

    await this.db.db
      .update(conversations)
      .set(updateData)
      .where(eq(conversations.id, conversationId));

    return Number(result[0].insertId);
  }

  async getConversationHistory(conversationId: number, limit = 10): Promise<MessageRow[]> {
    const rows = await this.db.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    return rows.reverse() as MessageRow[];
  }

  async getAllConversations(
    page = 1,
    perPage = 20,
    status: string | null = null,
  ): Promise<{ conversations: Array<ConversationRow & { lastMessage: string | null }>; total: number }> {
    const offset = (page - 1) * perPage;

    const lastMsgSubquery = sql<string>`(
      SELECT m.message_text FROM messages m
      WHERE m.conversation_id = conversations.id
      ORDER BY m.created_at DESC LIMIT 1
    )`.as('lastMessage');

    let query = this.db.db
      .select({
        id: conversations.id,
        phoneNumber: conversations.phoneNumber,
        contactName: conversations.contactName,
        status: conversations.status,
        aiEnabled: conversations.aiEnabled,
        lastMessageAt: conversations.lastMessageAt,
        lastBotMessageAt: conversations.lastBotMessageAt,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
        lastMessage: lastMsgSubquery,
      })
      .from(conversations);

    if (status) {
      query = query.where(eq(conversations.status, status as 'active' | 'closed' | 'pending_human')) as typeof query;
    }

    const rows = await query
      .orderBy(desc(conversations.lastMessageAt))
      .limit(perPage)
      .offset(offset);

    const countResult = await this.db.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(conversations);

    return {
      conversations: rows as Array<ConversationRow & { lastMessage: string | null }>,
      total: countResult[0]?.count ?? 0,
    };
  }

  async updateStatus(conversationId: number, status: 'active' | 'closed' | 'pending_human'): Promise<void> {
    await this.db.db
      .update(conversations)
      .set({ status })
      .where(eq(conversations.id, conversationId));
  }

  async toggleAI(conversationId: number, enabled: boolean): Promise<void> {
    await this.db.db
      .update(conversations)
      .set({ aiEnabled: enabled })
      .where(eq(conversations.id, conversationId));
  }

  async getStats(): Promise<{
    totalConversations: number;
    activeConversations: number;
    pendingHumanConversations: number;
    todayConversations: number;
    totalMessages: number;
    todayMessages: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalConvResult, activeConvResult, pendingResult, todayConvResult, totalMsgResult, todayMsgResult] = await Promise.all([
      this.db.db.select({ count: sql<number>`COUNT(*)` }).from(conversations),
      this.db.db.select({ count: sql<number>`COUNT(*)` }).from(conversations).where(eq(conversations.status, 'active')),
      this.db.db.select({ count: sql<number>`COUNT(*)` }).from(conversations).where(eq(conversations.status, 'pending_human')),
      this.db.db.select({ count: sql<number>`COUNT(*)` }).from(conversations).where(gte(conversations.createdAt, today)),
      this.db.db.select({ count: sql<number>`COUNT(*)` }).from(messages),
      this.db.db.select({ count: sql<number>`COUNT(*)` }).from(messages).where(gte(messages.createdAt, today)),
    ]);

    return {
      totalConversations: Number(totalConvResult[0]?.count ?? 0),
      activeConversations: Number(activeConvResult[0]?.count ?? 0),
      pendingHumanConversations: Number(pendingResult[0]?.count ?? 0),
      todayConversations: Number(todayConvResult[0]?.count ?? 0),
      totalMessages: Number(totalMsgResult[0]?.count ?? 0),
      todayMessages: Number(todayMsgResult[0]?.count ?? 0),
    };
  }
}

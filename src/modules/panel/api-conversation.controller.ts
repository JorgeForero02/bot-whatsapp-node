import { Controller, Get, Post, Body, Param, Query, Logger, HttpCode, HttpStatus, HttpException, UseGuards } from '@nestjs/common';
import { ApiAuthGuard } from '../../common/guards/api-auth.guard';
import { eq } from 'drizzle-orm';
import { ConversationService } from '../conversation/conversation.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { DatabaseService } from '../database/database.service';
import { conversations } from '../database/schema/conversations.schema';

@UseGuards(ApiAuthGuard)
@Controller('api')
export class ApiConversationController {
  private readonly logger = new Logger(ApiConversationController.name);

  constructor(
    private readonly conversation: ConversationService,
    private readonly whatsapp: WhatsAppService,
    private readonly db: DatabaseService,
  ) {}

  @Get('dashboard-stats')
  async getDashboardStats(): Promise<Record<string, unknown>> {
    try {
      const stats = await this.conversation.getStats();
      return { success: true, data: stats };
    } catch (error) {
      this.logger.error('Error getting dashboard stats:', error);
      return { success: false, error: 'Failed to load dashboard statistics' };
    }
  }

  @Get('dashboard-chart')
  async getDashboardChart(): Promise<Record<string, unknown>> {
    try {
      const chartData = await this.conversation.getMessagesLast7Days();
      return { success: true, data: chartData };
    } catch (error) {
      this.logger.error('Error getting dashboard chart data:', error);
      return { success: false, error: 'Failed to load chart data' };
    }
  }

  @Get('conversations')
  async getConversations(
    @Query('page') page = '1',
    @Query('status') status?: string,
  ): Promise<Record<string, unknown>> {
    const result = await this.conversation.getAllConversations(
      parseInt(page, 10),
      20,
      status ?? null,
    );
    return { success: true, data: result };
  }

  @Get('conversations/:id/messages')
  async getMessages(@Param('id') id: string): Promise<Record<string, unknown>> {
    const messages = await this.conversation.getConversationHistory(parseInt(id, 10), 50);
    return { success: true, data: messages };
  }

  @Post('conversations/:id/reply')
  @HttpCode(HttpStatus.OK)
  async replyConversation(
    @Param('id') id: string,
    @Body() body: { message: string },
  ): Promise<Record<string, unknown>> {
    const convId = parseInt(id, 10);

    if (!body.message || body.message.trim().length === 0) {
      throw new HttpException('Message is required', HttpStatus.BAD_REQUEST);
    }

    const rows = await this.db.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId))
      .limit(1);

    if (rows.length === 0) {
      throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
    }

    const conv = rows[0];

    await this.whatsapp.sendMessage(conv.phoneNumber, body.message);

    await this.conversation.addMessage(convId, 'human', body.message);

    await this.conversation.updateStatus(convId, 'active');

    return { success: true, message: 'Reply sent successfully' };
  }

  @Post('conversations/:id/toggle-ai')
  @HttpCode(HttpStatus.OK)
  async toggleAI(
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ): Promise<Record<string, unknown>> {
    await this.conversation.toggleAI(parseInt(id, 10), body.enabled);
    return { success: true };
  }

  @Get('conversations/:id')
  async getConversation(@Param('id') id: string): Promise<Record<string, unknown>> {
    const convId = parseInt(id, 10);
    const rows = await this.db.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId))
      .limit(1);

    if (rows.length === 0) {
      throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
    }

    const msgs = await this.conversation.getConversationHistory(convId, 50);
    return { success: true, data: { conversation: rows[0], messages: msgs } };
  }
}

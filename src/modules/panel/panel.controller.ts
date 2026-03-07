import { Controller, Get, Post, Delete, Body, Param, Query, Req, Logger, HttpCode, HttpStatus, HttpException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { ConversationService } from '../conversation/conversation.service';
import { DocumentService } from '../documents/document.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { DatabaseService } from '../database/database.service';
import { CredentialService } from '../credentials/credential.service';
import { FlowBuilderService } from '../classic-bot/flow-builder.service';
import { ClassicBotService } from '../classic-bot/classic-bot.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { eq } from 'drizzle-orm';
import { settings } from '../database/schema/settings.schema';
import { conversations } from '../database/schema/conversations.schema';
import { calendarSettings } from '../database/schema/calendar-settings.schema';
import { documents } from '../database/schema/documents.schema';

@Controller('api')
export class PanelController {
  private readonly logger = new Logger(PanelController.name);

  constructor(
    private readonly conversation: ConversationService,
    private readonly documents: DocumentService,
    private readonly onboarding: OnboardingService,
    private readonly db: DatabaseService,
    private readonly credentials: CredentialService,
    private readonly flowBuilder: FlowBuilderService,
    private readonly classicBot: ClassicBotService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  @Get('dashboard-stats')
  async getDashboardStats(): Promise<Record<string, unknown>> {
    const stats = await this.conversation.getStats();
    return { success: true, data: stats };
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

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  async uploadDocument(@Req() req: FastifyRequest): Promise<Record<string, unknown>> {
    const file = await (req as FastifyRequest & { file: () => Promise<{ filename: string; mimetype: string; file: NodeJS.ReadableStream } | undefined> }).file();

    if (!file) {
      throw new HttpException('No file uploaded. Use field name "file"', HttpStatus.BAD_REQUEST);
    }

    const ext = extname(file.filename).replace('.', '').toLowerCase();
    const allowedTypes = ['pdf', 'txt', 'docx'];
    if (!allowedTypes.includes(ext)) {
      throw new HttpException(`File type not allowed: ${ext}. Allowed: ${allowedTypes.join(', ')}`, HttpStatus.BAD_REQUEST);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(Buffer.from(chunk as Buffer));
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) {
      throw new HttpException('Empty file', HttpStatus.BAD_REQUEST);
    }

    const tempPath = join(tmpdir(), `upload_${Date.now()}_${file.filename}`);

    try {
      await writeFile(tempPath, buffer);

      const result = await this.documents.uploadDocument(
        tempPath,
        file.filename,
        ext,
        buffer.length,
      );

      return {
        success: true,
        document: {
          id: result.id,
          name: file.filename,
          size: buffer.length,
          chunks: result.chunkCount,
        },
      };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Upload failed', error instanceof Error ? error.message : '');
      throw new HttpException('Error al subir documento', HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      try { await unlink(tempPath); } catch { /* temp cleanup best effort */ }
    }
  }

  @Get('documents')
  async getDocuments(): Promise<Record<string, unknown>> {
    const docs = await this.documents.getAllDocuments();
    return { success: true, data: docs };
  }

  @Delete('documents/:id')
  async deleteDocument(@Param('id') id: string): Promise<Record<string, unknown>> {
    await this.documents.deleteDocument(parseInt(id, 10));
    return { success: true };
  }

  @Get('settings')
  async getSettings(): Promise<Record<string, unknown>> {
    const rows = await this.db.db.select().from(settings);
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.settingKey] = row.settingValue;
    }
    return { success: true, data: result };
  }

  @Post('settings')
  @HttpCode(HttpStatus.OK)
  async saveSettings(@Body() body: Record<string, string>): Promise<Record<string, unknown>> {
    for (const [key, value] of Object.entries(body)) {
      const existing = await this.db.db
        .select()
        .from(settings)
        .where(eq(settings.settingKey, key))
        .limit(1);

      if (existing.length > 0) {
        await this.db.db
          .update(settings)
          .set({ settingValue: value })
          .where(eq(settings.settingKey, key));
      } else {
        await this.db.db.insert(settings).values({
          settingKey: key,
          settingValue: value,
        });
      }
    }
    return { success: true };
  }

  @Get('onboarding-progress')
  async getOnboardingProgress(): Promise<Record<string, unknown>> {
    const progress = await this.onboarding.getProgress();
    const currentStep = await this.onboarding.getCurrentStep();
    return { success: true, data: { ...progress, currentStep } };
  }

  @Post('onboarding-progress')
  @HttpCode(HttpStatus.OK)
  async updateOnboardingProgress(
    @Body() body: { step: string; action: 'complete' | 'skip' },
  ): Promise<Record<string, unknown>> {
    if (body.action === 'complete') {
      await this.onboarding.completeStep(body.step);
    } else {
      await this.onboarding.skipStep(body.step);
    }
    return { success: true };
  }

  @Post('onboarding-reset')
  @HttpCode(HttpStatus.OK)
  async resetOnboarding(): Promise<Record<string, unknown>> {
    await this.onboarding.resetOnboarding();
    return { success: true };
  }

  @Post('credentials/whatsapp')
  @HttpCode(HttpStatus.OK)
  async saveWhatsAppCredentials(
    @Body() body: { accessToken?: string; phoneNumberId?: string; verifyToken?: string; appSecret?: string },
  ): Promise<Record<string, unknown>> {
    await this.credentials.saveWhatsAppCredentials(body);
    return { success: true };
  }

  @Post('credentials/openai')
  @HttpCode(HttpStatus.OK)
  async saveOpenAICredentials(
    @Body() body: { apiKey?: string },
  ): Promise<Record<string, unknown>> {
    await this.credentials.saveOpenAICredentials(body);
    return { success: true };
  }

  @Post('credentials/google')
  @HttpCode(HttpStatus.OK)
  async saveGoogleCredentials(
    @Body() body: { accessToken?: string; refreshToken?: string; clientId?: string; clientSecret?: string; calendarId?: string },
  ): Promise<Record<string, unknown>> {
    await this.credentials.saveGoogleOAuthCredentials(body);
    return { success: true };
  }

  // ── Flow Builder API ──

  @Get('flows')
  async getFlows(): Promise<Record<string, unknown>> {
    const tree = await this.flowBuilder.getFlowTree();
    return { success: true, data: tree };
  }

  @Post('flows')
  @HttpCode(HttpStatus.OK)
  async saveFlow(
    @Body() body: { id?: number | null; name: string; triggerKeywords: string[]; messageText: string; nextNodeId?: number | null; isRoot?: boolean; requiresCalendar?: boolean; matchAnyInput?: boolean; isFarewell?: boolean; positionOrder?: number; isActive?: boolean; options?: Array<{ optionText: string; optionKeywords: string[]; nextNodeId?: number | null; positionOrder?: number }> },
  ): Promise<Record<string, unknown>> {
    const nodeId = await this.flowBuilder.saveNode(body.id ?? null, body);
    return { success: true, data: { id: nodeId } };
  }

  @Delete('flows/:id')
  async deleteFlow(@Param('id') id: string): Promise<Record<string, unknown>> {
    await this.flowBuilder.deleteNode(parseInt(id, 10));
    return { success: true };
  }

  @Get('flows/export')
  async exportFlows(): Promise<Record<string, unknown>> {
    const data = await this.flowBuilder.exportToJson();
    return { success: true, data };
  }

  @Post('flows/import')
  @HttpCode(HttpStatus.OK)
  async importFlows(@Body() body: { version: string; exportedAt: string; nodes: Array<Record<string, unknown>> }): Promise<Record<string, unknown>> {
    const result = await this.flowBuilder.importFromJson(body as unknown as Parameters<FlowBuilderService['importFromJson']>[0]);
    return { success: true, data: result };
  }

  @Post('simulate-flow')
  @HttpCode(HttpStatus.OK)
  async simulateFlow(@Body() body: { message: string }): Promise<Record<string, unknown>> {
    const result = await this.classicBot.processMessage('simulator', body.message);
    await this.classicBot.clearSession('simulator');
    return { success: true, data: result };
  }

  // ── Conversation detail ──

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

  // ── Document content ──

  @Get('documents/:id/content')
  async getDocumentContent(@Param('id') id: string): Promise<Record<string, unknown>> {
    const doc = await this.documents.getDocument(parseInt(id, 10));
    if (!doc) {
      throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
    }
    return { success: true, data: { id: doc['id'], name: doc['original_name'], content: doc['content_text'] } };
  }

  // ── Credentials read (masked) ──

  @Get('credentials')
  async getCredentials(): Promise<Record<string, unknown>> {
    let whatsapp = { configured: false };
    let openai = { configured: false };
    let google = { configured: false };

    try {
      const wa = await this.credentials.getWhatsAppCredentials();
      whatsapp = { configured: !!(wa.accessToken && wa.phoneNumberId) } as typeof whatsapp;
    } catch { /* not configured */ }

    try {
      const oa = await this.credentials.getOpenAICredentials();
      openai = { configured: !!oa.apiKey } as typeof openai;
    } catch { /* not configured */ }

    try {
      const go = await this.credentials.getGoogleOAuthCredentials();
      google = { configured: !!(go.accessToken && go.clientId) } as typeof google;
    } catch { /* not configured */ }

    return { success: true, data: { whatsapp, openai, google } };
  }

  // ── Calendar Settings ──

  @Get('calendar-settings')
  async getCalendarSettings(): Promise<Record<string, unknown>> {
    const rows = await this.db.db.select().from(calendarSettings);
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.settingKey] = row.settingValue;
    }
    return { success: true, data: result };
  }

  @Post('calendar-settings')
  @HttpCode(HttpStatus.OK)
  async saveCalendarSettings(@Body() body: Record<string, string>): Promise<Record<string, unknown>> {
    for (const [key, value] of Object.entries(body)) {
      const existing = await this.db.db
        .select()
        .from(calendarSettings)
        .where(eq(calendarSettings.settingKey, key))
        .limit(1);

      if (existing.length > 0) {
        await this.db.db
          .update(calendarSettings)
          .set({ settingValue: value })
          .where(eq(calendarSettings.settingKey, key));
      } else {
        await this.db.db.insert(calendarSettings).values({
          settingKey: key,
          settingValue: value,
        });
      }
    }
    return { success: true };
  }

  // ── Test Connection ──

  @Get('test-connection')
  async testConnection(): Promise<Record<string, unknown>> {
    try {
      const creds = await this.credentials.getWhatsAppCredentials();
      if (!creds.accessToken || !creds.phoneNumberId) {
        return { success: false, error: 'WhatsApp credentials not configured' };
      }
      return { success: true, message: 'Credentials configured correctly' };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ── Health ──

  @Get('health')
  getHealth(): Record<string, unknown> {
    return {
      success: true,
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  // ── Check OpenAI Status ──

  @Get('check-openai-status')
  async checkOpenAIStatus(): Promise<Record<string, unknown>> {
    try {
      const creds = await this.credentials.getOpenAICredentials();
      if (!creds.apiKey) {
        return { success: true, data: { configured: false, status: 'No API key configured' } };
      }
      return { success: true, data: { configured: true, status: 'API key configured' } };
    } catch (error: unknown) {
      return { success: true, data: { configured: false, status: error instanceof Error ? error.message : 'Error' } };
    }
  }
}

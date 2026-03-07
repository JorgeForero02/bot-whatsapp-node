import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { OpenAIService } from '../openai/openai.service';
import { ConversationService } from '../conversation/conversation.service';
import { RagService } from '../rag/rag.service';
import { CalendarFlowHandler } from '../calendar/calendar-flow.handler';
import { ClassicCalendarFlowHandler } from '../calendar/classic-calendar-flow.handler';
import { ClassicBotService } from '../classic-bot/classic-bot.service';
import { DatabaseService } from '../database/database.service';
import { settings } from '../database/schema/settings.schema';
import { webhookQueue } from '../database/schema/webhook-queue.schema';

export interface WebhookJobData {
  messageId: string;
  from: string;
  contactName: string;
  text: string;
  type: string;
  audioId?: string;
  mimeType?: string;
  timestamp: number;
  rawPayload: Record<string, unknown>;
  dbQueueId?: number;
}

@Processor('webhook-queue')
export class WebhookQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookQueueProcessor.name);

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly openai: OpenAIService,
    private readonly conversation: ConversationService,
    private readonly rag: RagService,
    private readonly db: DatabaseService,
    private readonly calendarFlow: CalendarFlowHandler,
    private readonly classicBot: ClassicBotService,
    private readonly classicCalendar: ClassicCalendarFlowHandler,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const data = job.data;
    this.logger.log(`Processing job ${job.id} from=${data.from} type=${data.type}`);

    if (data.dbQueueId) {
      await this.updateQueueStatus(data.dbQueueId, 'processing');
    }

    try {
      await this.whatsapp.markAsRead(data.messageId);

      const conv = await this.conversation.getOrCreateConversation(
        data.from,
        data.contactName,
      );

      if (!conv.aiEnabled) {
        this.logger.log(`AI disabled for conversation ${conv.id}, skipping`);
        if (data.dbQueueId) await this.updateQueueStatus(data.dbQueueId, 'completed');
        return;
      }

      const unsupportedMedia = ['image', 'video', 'document', 'sticker', 'location', 'contacts'];
      if (unsupportedMedia.includes(data.type)) {
        this.logger.log(`Unsupported media type ${data.type} from ${data.from}`);
        await this.conversation.addMessage(conv.id, 'user', `[${data.type}]`, {
          messageId: data.messageId,
          mediaType: data.type as 'image' | 'video' | 'document',
        });
        const mediaMsg = 'Por el momento solo puedo procesar mensajes de texto y audio. ¿Podrías escribirme tu consulta?';
        await this.conversation.addMessage(conv.id, 'bot', mediaMsg);
        await this.whatsapp.sendMessage(data.from, mediaMsg);
        if (data.dbQueueId) await this.updateQueueStatus(data.dbQueueId, 'completed');
        return;
      }

      let userText = data.text;

      if (data.type === 'audio' && data.audioId) {
        try {
          const audioContent = await this.whatsapp.downloadMedia(data.audioId);
          userText = await this.openai.transcribeAudio(audioContent);
          this.logger.log(`Transcribed audio: ${userText.substring(0, 50)}...`);
        } catch (error: unknown) {
          this.logger.error('Audio transcription failed', error instanceof Error ? error.message : '');
          await this.whatsapp.sendMessage(
            data.from,
            'No pude procesar tu mensaje de audio. ¿Podrías escribirme?',
          );
          if (data.dbQueueId) await this.updateQueueStatus(data.dbQueueId, 'failed', 'Audio transcription failed');
          return;
        }
      }

      if (!userText || userText.trim().length === 0) {
        if (data.dbQueueId) await this.updateQueueStatus(data.dbQueueId, 'completed');
        return;
      }

      await this.conversation.addMessage(conv.id, 'user', userText, {
        messageId: data.messageId,
        mediaType: data.type as 'text' | 'audio',
      });

      const botMode = await this.getBotMode();

      if (botMode === 'classic') {
        await this.handleClassicMode(data.from, userText, conv.id, data.contactName);
      } else {
        await this.handleAIMode(data.from, userText, conv.id, data.contactName);
      }

      if (data.dbQueueId) await this.updateQueueStatus(data.dbQueueId, 'completed');
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Job ${job.id} failed: ${errorMsg}`);
      if (data.dbQueueId) await this.updateQueueStatus(data.dbQueueId, 'failed', errorMsg);
      throw error;
    }
  }

  private async handleAIMode(from: string, userText: string, conversationId: number, contactName: string): Promise<void> {
    const systemPrompt = await this.getSystemPrompt();
    const history = await this.conversation.getConversationHistory(conversationId, 10);
    const historyFormatted = history.map((m) => ({
      sender: m.senderType,
      message_text: m.messageText,
    }));

    // ── Calendar flow: check active state + detect intent ──
    try {
      const calendarResponse = await this.calendarFlow.handleMessage(
        from,
        userText,
        conversationId,
        contactName,
        systemPrompt,
        historyFormatted,
      );

      if (calendarResponse) {
        if (calendarResponse.startsWith('__HANDOFF__:')) {
          const reason = calendarResponse.substring('__HANDOFF__:'.length);
          this.logger.log(`Handoff to human triggered for ${from}: ${reason}`);
          await this.conversation.toggleAI(conversationId, false);
          await this.conversation.updateStatus(conversationId, 'pending_human');
          const handoffMsg = 'Te voy a transferir con un agente humano que podrá ayudarte mejor. Por favor espera un momento. 🙋';
          await this.conversation.addMessage(conversationId, 'bot', handoffMsg);
          await this.whatsapp.sendMessage(from, handoffMsg);
          return;
        }

        this.logger.log(`Calendar flow handled for ${from}`);
        await this.conversation.addMessage(conversationId, 'bot', calendarResponse);
        await this.whatsapp.sendMessage(from, calendarResponse);
        return;
      }
    } catch (error: unknown) {
      this.logger.error('Calendar flow error', error instanceof Error ? error.message : '');
    }

    // ── RAG fallback ──
    let response: string;
    let context = '';

    try {
      const ragResult = await this.rag.generateResponse(
        userText,
        systemPrompt,
        historyFormatted,
      );
      response = ragResult.response;
      context = ragResult.context;
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'INSUFFICIENT_FUNDS') {
        response = 'El servicio de IA no está disponible en este momento. Un agente te atenderá pronto.';
      } else {
        this.logger.error('RAG generation failed', error instanceof Error ? error.message : '');
        response = 'Lo siento, ocurrió un error. Por favor intenta de nuevo.';
      }
    }

    await this.conversation.addMessage(conversationId, 'bot', response, {
      contextUsed: context || undefined,
    });
    await this.whatsapp.sendMessage(from, response);
  }

  private async handleClassicMode(from: string, userText: string, conversationId: number, contactName: string): Promise<void> {
    try {
      // ── 1. Check for active classic calendar session ──
      const calendarResponse = await this.classicCalendar.handleMessage(from, userText, contactName);
      if (calendarResponse) {
        this.logger.log(`Classic calendar flow handled for ${from}`);
        await this.conversation.addMessage(conversationId, 'bot', calendarResponse);
        await this.whatsapp.sendMessage(from, calendarResponse);
        return;
      }

      // ── 2. Process through ClassicBotService (nodes/options) ──
      const result = await this.classicBot.processMessage(from, userText);

      if (result.type === 'response' || result.type === 'fallback') {
        const response = result.response || 'Escribe el número de tu opción o escríbeme lo que necesitas.';
        await this.conversation.addMessage(conversationId, 'bot', response);
        await this.whatsapp.sendMessage(from, response);
        return;
      }

      // ── 3. Calendar intent detected by classic bot ──
      if (result.type === 'calendar') {
        try {
          const menuResponse = await this.classicCalendar.startCalendarMenu(from);
          await this.conversation.addMessage(conversationId, 'bot', menuResponse);
          await this.whatsapp.sendMessage(from, menuResponse);
        } catch (error: unknown) {
          this.logger.error('Classic calendar start failed', error instanceof Error ? error.message : '');
          const unavailableMsg = 'Lo sentimos, ese servicio no está activo en este momento. Presiona *menu* para volver.';
          await this.conversation.addMessage(conversationId, 'bot', unavailableMsg);
          await this.whatsapp.sendMessage(from, unavailableMsg);
        }
        return;
      }
    } catch (error: unknown) {
      this.logger.error('Classic bot error', error instanceof Error ? error.message : '');
      const errorMsg = 'Lo siento, ocurrió un error procesando tu mensaje. Por favor intenta de nuevo.';
      try {
        await this.conversation.addMessage(conversationId, 'bot', errorMsg);
        await this.whatsapp.sendMessage(from, errorMsg);
      } catch { /* best effort */ }
    }
  }

  private async getSystemPrompt(): Promise<string> {
    try {
      const result = await this.db.db
        .select()
        .from(settings)
        .where(eq(settings.settingKey, 'system_prompt'))
        .limit(1);

      if (result.length > 0 && result[0].settingValue) {
        return result[0].settingValue;
      }
    } catch {
      // Fall through to default
    }
    return 'Eres un asistente virtual útil y amigable. Responde de manera clara y concisa en español.';
  }

  private async getBotMode(): Promise<string> {
    try {
      const result = await this.db.db
        .select()
        .from(settings)
        .where(eq(settings.settingKey, 'bot_mode'))
        .limit(1);

      if (result.length > 0 && result[0].settingValue) {
        return result[0].settingValue;
      }
    } catch {
      // Fall through to default
    }
    return 'ai';
  }

  private async updateQueueStatus(
    queueId: number,
    status: 'processing' | 'completed' | 'failed',
    errorMessage?: string,
  ): Promise<void> {
    try {
      const updateData: Record<string, unknown> = { status };
      if (status === 'processing') {
        updateData['startedAt'] = new Date();
      }
      if (status === 'completed' || status === 'failed') {
        updateData['completedAt'] = new Date();
      }
      if (errorMessage) {
        updateData['errorMessage'] = errorMessage;
      }
      await this.db.db
        .update(webhookQueue)
        .set(updateData)
        .where(eq(webhookQueue.id, queueId));
    } catch (error: unknown) {
      this.logger.error('Failed to update queue status', error instanceof Error ? error.message : '');
    }
  }
}

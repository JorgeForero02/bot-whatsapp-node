import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';
import { WhatsAppService, ParsedMessage } from '../whatsapp/whatsapp.service';
import { OpenAIService } from '../openai/openai.service';
import { ConversationService } from '../conversation/conversation.service';
import { RagService } from '../rag/rag.service';
import { DatabaseService } from '../database/database.service';
import { settings } from '../database/schema/settings.schema';

@Injectable()
export class WebhookProcessorService {
  private readonly logger = new Logger(WebhookProcessorService.name);

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly openai: OpenAIService,
    private readonly conversation: ConversationService,
    private readonly rag: RagService,
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async process(message: ParsedMessage): Promise<void> {
    try {
      await this.whatsapp.markAsRead(message.messageId);

      const conv = await this.conversation.getOrCreateConversation(
        message.from,
        message.contactName,
      );

      if (!conv.aiEnabled) {
        this.logger.log(`AI disabled for conversation ${conv.id}, skipping`);
        return;
      }

      let userText = message.text;

      if (message.type === 'audio' && message.audioId) {
        try {
          const audioContent = await this.whatsapp.downloadMedia(message.audioId);
          userText = await this.openai.transcribeAudio(audioContent);
          this.logger.log(`Transcribed audio: ${userText.substring(0, 50)}...`);
        } catch (error: unknown) {
          this.logger.error('Audio transcription failed', error instanceof Error ? error.message : '');
          await this.whatsapp.sendMessage(
            message.from,
            'No pude procesar tu mensaje de audio. ¿Podrías escribirme?',
          );
          return;
        }
      }

      if (!userText || userText.trim().length === 0) {
        return;
      }

      await this.conversation.addMessage(conv.id, 'user', userText, {
        messageId: message.messageId,
        mediaType: message.type as 'text' | 'audio',
      });

      const systemPrompt = await this.getSystemPrompt();
      const history = await this.conversation.getConversationHistory(conv.id, 10);
      const historyFormatted = history.map((m) => ({
        sender: m.senderType,
        message_text: m.messageText,
      }));

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

      await this.conversation.addMessage(conv.id, 'bot', response, {
        contextUsed: context || undefined,
      });

      await this.whatsapp.sendMessage(message.from, response);
    } catch (error: unknown) {
      this.logger.error('Webhook processing error', error instanceof Error ? error.stack : String(error));
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
}

import { Injectable, Logger } from '@nestjs/common';
import { ConversationService } from '../../conversation/conversation.service';
import { WhatsAppService } from '../../whatsapp/whatsapp.service';
import { RagService } from '../../rag/rag.service';
import { SettingsService } from '../../settings/settings.service';
import { MessageProcessingStrategy, MessageContext, StrategyResult } from './message-processing.strategy';

@Injectable()
export class AiStrategy implements MessageProcessingStrategy {
  private readonly logger = new Logger(AiStrategy.name);

  constructor(
    private readonly conversation: ConversationService,
    private readonly whatsapp: WhatsAppService,
    private readonly rag: RagService,
    private readonly settings: SettingsService,
  ) {}

  async process(context: MessageContext): Promise<StrategyResult> {
    const systemPrompt = await this.settings.get(
      'system_prompt',
      'Eres un asistente virtual útil y amigable. Responde de manera clara y concisa en español.',
    );
    const history = await this.conversation.getConversationHistory(context.conversationId, 10);
    const historyFormatted = history.map((m) => ({
      sender: m.senderType,
      message_text: m.messageText,
    }));

    let response: string;
    let responseContext = '';

    try {
      const ragResult = await this.rag.generateResponse(
        context.userText,
        systemPrompt,
        historyFormatted,
      );
      response = ragResult.response;
      responseContext = ragResult.context;
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'INSUFFICIENT_FUNDS') {
        await this.handleInsufficientFunds();
        response = 'El servicio de IA no está disponible en este momento. Un agente te atenderá pronto.';
      } else {
        this.logger.error('RAG generation failed', error instanceof Error ? error.message : '');
        response = 'Lo siento, ocurrió un error. Por favor intenta de nuevo.';
      }
    }

    await this.conversation.addMessage(context.conversationId, 'bot', response, {
      contextUsed: responseContext || undefined,
    });
    await this.whatsapp.sendMessage(context.from, response);
    return { handled: true };
  }

  private async handleInsufficientFunds(): Promise<void> {
    try {
      await this.settings.set('openai_status', 'insufficient_funds');
    } catch { }
  }
}

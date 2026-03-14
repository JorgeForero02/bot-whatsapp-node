import { Injectable, Logger } from '@nestjs/common';
import { ConversationService } from '../../conversation/conversation.service';
import { WhatsAppService } from '../../whatsapp/whatsapp.service';
import { CalendarFlowHandler } from '../../calendar/calendar-flow.handler';
import { SettingsService } from '../../settings/settings.service';
import { MessageProcessingStrategy, MessageContext, StrategyResult } from './message-processing.strategy';

@Injectable()
export class CalendarStrategy implements MessageProcessingStrategy {
  private readonly logger = new Logger(CalendarStrategy.name);

  constructor(
    private readonly conversation: ConversationService,
    private readonly whatsapp: WhatsAppService,
    private readonly calendarFlow: CalendarFlowHandler,
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

    try {
      const calendarResponse = await this.calendarFlow.handleMessage(
        context.from,
        context.userText,
        context.conversationId,
        context.contactName,
        systemPrompt,
        historyFormatted,
      );

      if (!calendarResponse) return { handled: false };

      if (calendarResponse.startsWith('__HANDOFF__:')) {
        const reason = calendarResponse.substring('__HANDOFF__:'.length);
        this.logger.log(`Handoff to human triggered for ${context.from}: ${reason}`);
        await this.conversation.toggleAI(context.conversationId, false);
        await this.conversation.updateStatus(context.conversationId, 'pending_human');
        const handoffMsg = 'Te voy a transferir con un agente humano que podrá ayudarte mejor. Por favor espera un momento. 🙋';
        await this.conversation.addMessage(context.conversationId, 'bot', handoffMsg);
        await this.whatsapp.sendMessage(context.from, handoffMsg);
        return { handled: true };
      }

      this.logger.log(`Calendar flow handled for ${context.from}`);
      await this.conversation.addMessage(context.conversationId, 'bot', calendarResponse);
      await this.whatsapp.sendMessage(context.from, calendarResponse);
      return { handled: true };
    } catch (error: unknown) {
      this.logger.error('Calendar flow error', error instanceof Error ? error.message : '');
      return { handled: false };
    }
  }
}

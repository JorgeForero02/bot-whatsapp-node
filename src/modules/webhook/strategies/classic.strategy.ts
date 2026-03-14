import { Injectable, Logger } from '@nestjs/common';
import { ConversationService } from '../../conversation/conversation.service';
import { WhatsAppService } from '../../whatsapp/whatsapp.service';
import { ClassicBotService } from '../../classic-bot/classic-bot.service';
import { ClassicCalendarFlowHandler } from '../../calendar/classic-calendar-flow.handler';
import { MessageProcessingStrategy, MessageContext, StrategyResult } from './message-processing.strategy';

@Injectable()
export class ClassicStrategy implements MessageProcessingStrategy {
  private readonly logger = new Logger(ClassicStrategy.name);

  constructor(
    private readonly conversation: ConversationService,
    private readonly whatsapp: WhatsAppService,
    private readonly classicBot: ClassicBotService,
    private readonly classicCalendar: ClassicCalendarFlowHandler,
  ) {}

  async process(context: MessageContext): Promise<StrategyResult> {
    const calendarUnavailableMsg = 'Lo sentimos, ese servicio no está activo en este momento. Presiona *menu* para volver.';

    try {
      const calendarResponse = await this.classicCalendar.handleMessage(context.from, context.userText, context.contactName);
      if (calendarResponse) {
        this.logger.log(`Classic calendar flow handled for ${context.from}`);
        await this.sendBotResponse(context.conversationId, context.from, calendarResponse);
        return { handled: true };
      }

      const result = await this.classicBot.processMessage(context.from, context.userText);

      if (result.type === 'response' || result.type === 'fallback' || result.type === 'farewell') {
        const response = result.response || 'Escribe el número de tu opción o escríbeme lo que necesitas.';
        await this.sendBotResponse(context.conversationId, context.from, response);
        return { handled: true };
      }

      if (result.type === 'calendar') {
        try {
          const menuResponse = await this.classicCalendar.startCalendarMenu(context.from);
          await this.sendBotResponse(context.conversationId, context.from, menuResponse);
        } catch (error: unknown) {
          this.logger.error('Classic calendar start failed', error instanceof Error ? error.message : '');
          await this.sendBotResponse(context.conversationId, context.from, calendarUnavailableMsg);
        }
        return { handled: true };
      }
    } catch (error: unknown) {
      const errorMsg = 'Lo siento, ocurrió un error procesando tu mensaje. Por favor intenta de nuevo.';
      try {
        await this.sendBotResponse(context.conversationId, context.from, errorMsg);
      } catch { }
    }

    return { handled: true };
  }

  private async sendBotResponse(conversationId: number, phone: string, response: string): Promise<void> {
    try {
      await this.conversation.addMessage(conversationId, 'bot', response);
    } catch (error: unknown) {
      this.logger.error('Failed to save bot message to DB', error instanceof Error ? error.message : '');
    }
    try {
      await this.whatsapp.sendMessage(phone, response);
    } catch (error: unknown) {
      this.logger.error('Failed to send WhatsApp message', error instanceof Error ? error.message : '');
    }
  }
}

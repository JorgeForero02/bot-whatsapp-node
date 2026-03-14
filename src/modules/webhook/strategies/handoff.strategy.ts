import { Injectable, Logger } from '@nestjs/common';
import { ConversationService } from '../../conversation/conversation.service';
import { WhatsAppService } from '../../whatsapp/whatsapp.service';
import { MessageProcessingStrategy, MessageContext, StrategyResult } from './message-processing.strategy';

@Injectable()
export class HandoffStrategy implements MessageProcessingStrategy {
  private readonly logger = new Logger(HandoffStrategy.name);

  constructor(
    private readonly conversation: ConversationService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  async process(context: MessageContext): Promise<StrategyResult> {
    const handoffMsg = 'Enseguida te comunico con alguien de nuestro equipo.';
    await this.conversation.addMessage(context.conversationId, 'bot', handoffMsg);
    await this.whatsapp.sendMessage(context.from, handoffMsg);
    await this.conversation.updateStatus(context.conversationId, 'pending_human');
    await this.conversation.toggleAI(context.conversationId, false);
    return { handled: true };
  }
}

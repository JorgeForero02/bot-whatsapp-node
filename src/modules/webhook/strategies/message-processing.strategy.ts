export interface MessageContext {
  from: string;
  userText: string;
  conversationId: number;
  contactName: string;
}

export interface StrategyResult {
  handled: boolean;
}

export interface MessageProcessingStrategy {
  process(context: MessageContext): Promise<StrategyResult>;
}

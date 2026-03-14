import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from '../openai/openai.service';

export interface CalendarIntentResult {
  intent: 'schedule' | 'check_availability' | 'list' | 'reschedule' | 'cancel' | 'transfer_to_human' | 'none';
  extractedData: Record<string, unknown>;
  confidence: 'high' | 'low';
  originalResponse: string | null;
}

@Injectable()
export class CalendarIntentService {
  private readonly logger = new Logger(CalendarIntentService.name);

  constructor(private readonly openai: OpenAIService) {}

  async detectIntent(
    message: string,
    conversationHistory: Array<{ sender: string; message_text: string }>,
    systemPrompt: string,
  ): Promise<CalendarIntentResult> {
    this.logger.log(`Detecting calendar intent for message: "${message.substring(0, 50)}..."`);
    try {
      const tools = [...this.openai.getCalendarTools(), this.openai.getHandoffTool()];
      this.logger.log(`Using ${tools.length} calendar tools for intent detection`);
      
      const response = await this.openai.generateResponseWithTools(
        message,
        '',
        systemPrompt,
        tools,
        0.7,
        500,
        conversationHistory,
      );
      
      this.logger.log(`OpenAI response: tool_calls=${response.tool_calls?.length ?? 0}, content=${response.content?.substring(0, 50) ?? 'null'}`);
      return this.parseResponse(response);
    } catch (error: unknown) {
      this.logger.error('Error detecting intent', error instanceof Error ? error.message : '');
      return { intent: 'none', extractedData: {}, confidence: 'low', originalResponse: null };
    }
  }

  private parseResponse(message: {
    content?: string | null;
    tool_calls?: Array<{ function: { name: string; arguments: string } }>;
  }): CalendarIntentResult {
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      const fnName = toolCall.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
      } catch { }

      this.logger.log(`Calendar tool invoked: ${fnName} with args: ${JSON.stringify(args)}`);

      switch (fnName) {
        case 'schedule_appointment':
          return {
            intent: 'schedule',
            extractedData: {
              date_preference: (args['date_preference'] as string) ?? '',
              time_preference: (args['time_preference'] as string) ?? null,
              service_type: (args['service_type'] as string) ?? null,
              is_confirmed: (args['is_confirmed'] as boolean) ?? false,
            },
            confidence: args['date_preference'] ? 'high' : 'low',
            originalResponse: (message.content as string) ?? null,
          };

        case 'check_availability':
          return {
            intent: 'check_availability',
            extractedData: { date_range: (args['date_range'] as string) ?? '' },
            confidence: args['date_range'] ? 'high' : 'low',
            originalResponse: (message.content as string) ?? null,
          };

        case 'list_appointments':
          return {
            intent: 'list',
            extractedData: {},
            confidence: 'high',
            originalResponse: (message.content as string) ?? null,
          };

        case 'reschedule_appointment':
          return {
            intent: 'reschedule',
            extractedData: { reason: (args['reason'] as string) ?? null },
            confidence: 'high',
            originalResponse: (message.content as string) ?? null,
          };

        case 'cancel_appointment':
          return {
            intent: 'cancel',
            extractedData: { reason: (args['reason'] as string) ?? null },
            confidence: 'high',
            originalResponse: (message.content as string) ?? null,
          };

        case 'transfer_to_human':
          return {
            intent: 'transfer_to_human',
            extractedData: { reason: (args['reason'] as string) ?? 'El usuario solicitó hablar con un agente' },
            confidence: 'high',
            originalResponse: (message.content as string) ?? null,
          };

        default:
          this.logger.warn(`Unknown calendar tool: ${fnName}`);
      }
    }

    this.logger.log('No calendar tool called - returning intent: none');
    return { intent: 'none', extractedData: {}, confidence: 'low', originalResponse: (message.content as string) ?? null };
  }
}

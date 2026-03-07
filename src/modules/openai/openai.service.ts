import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CredentialService } from '../credentials/credential.service';
import { writeFile, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import FormData from 'form-data';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface HistoryMessage {
  sender: string;
  message_text: string;
}

interface ToolFunction {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ToolCallResponse {
  content?: string | null;
  tool_calls?: Array<{
    function: { name: string; arguments: string };
  }>;
}

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly baseUrl = 'https://api.openai.com/v1';

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly credentials: CredentialService,
  ) {}

  private async getApiKey(): Promise<string> {
    const creds = await this.credentials.getOpenAICredentials();
    return creds.apiKey;
  }

  async createEmbedding(text: string): Promise<number[]> {
    const apiKey = await this.getApiKey();
    const model = this.config.get<string>('openai.embeddingModel') ?? 'text-embedding-ada-002';

    try {
      const { data } = await firstValueFrom(
        this.http.post(`${this.baseUrl}/embeddings`, {
          model,
          input: text,
        }, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        }),
      );

      const embedding = (data as { data?: Array<{ embedding?: number[] }> }).data?.[0]?.embedding;
      if (!embedding) throw new Error('Invalid embedding response');
      return embedding;
    } catch (error: unknown) {
      this.handleOpenAIError(error, 'Embedding');
      throw error;
    }
  }

  async generateResponse(
    prompt: string,
    context = '',
    systemPrompt: string | null = null,
    temperature = 0.7,
    maxTokens = 500,
    conversationHistory: HistoryMessage[] = [],
    modelOverride: string | null = null,
  ): Promise<string> {
    const apiKey = await this.getApiKey();
    const model = modelOverride ?? this.config.get<string>('openai.model') ?? 'gpt-3.5-turbo';

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt ?? 'Eres un asistente virtual útil y amigable. Responde de manera clara y concisa basándote en el contexto proporcionado.' },
    ];

    if (context) {
      messages.push({ role: 'system', content: `Contexto relevante:\n${context}` });
    }

    for (const msg of conversationHistory) {
      messages.push({
        role: msg.sender === 'bot' ? 'assistant' : 'user',
        content: msg.message_text,
      });
    }

    messages.push({ role: 'user', content: prompt });

    try {
      const { data } = await firstValueFrom(
        this.http.post(`${this.baseUrl}/chat/completions`, {
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        }),
      );

      const content = (data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
      if (!content) throw new Error('Invalid chat response');
      return content;
    } catch (error: unknown) {
      this.handleOpenAIError(error, 'Generation');
      throw error;
    }
  }

  async generateResponseWithTools(
    prompt: string,
    context = '',
    systemPrompt: string | null = null,
    tools: ToolFunction[] = [],
    temperature = 0.7,
    maxTokens = 500,
    conversationHistory: HistoryMessage[] = [],
  ): Promise<ToolCallResponse> {
    const apiKey = await this.getApiKey();
    const model = this.config.get<string>('openai.model') ?? 'gpt-3.5-turbo';

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt ?? 'Eres un asistente virtual útil y amigable.' },
    ];

    if (context) {
      messages.push({ role: 'system', content: `Contexto relevante:\n${context}` });
    }

    for (const msg of conversationHistory) {
      messages.push({
        role: msg.sender === 'bot' ? 'assistant' : 'user',
        content: msg.message_text,
      });
    }

    messages.push({ role: 'user', content: prompt });

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    if (tools.length > 0) {
      body['tools'] = tools;
      body['tool_choice'] = 'auto';
    }

    try {
      const { data } = await firstValueFrom(
        this.http.post(`${this.baseUrl}/chat/completions`, body, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        }),
      );

      const message = (data as { choices?: Array<{ message?: ToolCallResponse }> }).choices?.[0]?.message;
      if (!message) throw new Error('Invalid chat response with tools');
      return message;
    } catch (error: unknown) {
      this.handleOpenAIError(error, 'Tools');
      throw error;
    }
  }

  getHandoffTool(): ToolFunction {
    return {
      type: 'function',
      function: {
        name: 'transfer_to_human',
        description: 'El usuario necesita hablar con un agente humano, ya sea porque lo pide explícitamente, porque el bot no puede resolver su problema, o porque la situación requiere atención personalizada.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Razón por la cual se transfiere al usuario a un agente humano' },
          },
          required: ['reason'],
        },
      },
    };
  }

  getCalendarTools(): ToolFunction[] {
    return [
      {
        type: 'function',
        function: {
          name: 'schedule_appointment',
          description: 'El usuario quiere agendar, reservar, programar o sacar una cita, turno, reunión, consulta o cualquier tipo de evento.',
          parameters: {
            type: 'object',
            properties: {
              date_preference: { type: 'string', description: 'Fecha o referencia temporal mencionada' },
              time_preference: { type: 'string', description: 'Hora o rango preferido si fue mencionado' },
              service_type: { type: 'string', description: 'Tipo de servicio o motivo si fue mencionado' },
              is_confirmed: { type: 'boolean', description: 'true solo si el usuario ya confirmó explícitamente fecha y hora específicas' },
            },
            required: ['is_confirmed'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'check_availability',
          description: 'El usuario pregunta por disponibilidad sin necesariamente querer agendar.',
          parameters: {
            type: 'object',
            properties: {
              date_range: { type: 'string', description: 'Rango de fechas consultado' },
            },
            required: ['date_range'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_appointments',
          description: 'El usuario quiere consultar, ver o saber sus citas, eventos o reservas próximas.',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
      {
        type: 'function',
        function: {
          name: 'reschedule_appointment',
          description: 'El usuario quiere reagendar, mover, reprogramar o cambiar la fecha/hora de una cita existente.',
          parameters: {
            type: 'object',
            properties: {
              reason: { type: 'string', description: 'Motivo del reagendamiento si fue mencionado' },
            },
            required: [],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'cancel_appointment',
          description: 'El usuario quiere cancelar o anular definitivamente una cita existente.',
          parameters: {
            type: 'object',
            properties: {
              reason: { type: 'string', description: 'Motivo de cancelación si fue mencionado' },
            },
            required: [],
          },
        },
      },
    ];
  }

  async transcribeAudio(audioContent: Buffer, filename = 'audio.ogg'): Promise<string> {
    const apiKey = await this.getApiKey();
    const tempPath = join(tmpdir(), `${randomUUID()}_${filename}`);

    try {
      await writeFile(tempPath, audioContent);

      const form = new FormData();
      form.append('file', createReadStream(tempPath), { filename });
      form.append('model', 'whisper-1');
      form.append('language', 'es');

      const { data } = await firstValueFrom(
        this.http.post(`${this.baseUrl}/audio/transcriptions`, form, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            ...form.getHeaders(),
          },
          maxContentLength: Infinity,
        }),
      );

      const text = (data as { text?: string }).text;
      if (!text) throw new Error('Invalid transcription response');

      this.logger.log(`Whisper: Audio transcribed, length=${text.length}`);
      return text;
    } finally {
      try { await unlink(tempPath); } catch { /* ignore */ }
    }
  }

  async createBatchEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
    const results: (number[] | null)[] = [];
    for (let i = 0; i < texts.length; i++) {
      try {
        results.push(await this.createEmbedding(texts[i]));
      } catch (error: unknown) {
        this.logger.error(`Batch embedding error for index ${i}`, error instanceof Error ? error.message : '');
        results.push(null);
      }
    }
    return results;
  }

  private handleOpenAIError(error: unknown, context: string): void {
    if (error && typeof error === 'object' && 'response' in error) {
      const resp = error as { response?: { status?: number; data?: { error?: { code?: string; message?: string } } } };
      const status = resp.response?.status;
      const code = resp.response?.data?.error?.code;
      const msg = resp.response?.data?.error?.message;

      if (status === 429 || code === 'insufficient_quota') {
        this.logger.error(`OpenAI Insufficient Funds: ${msg ?? 'Quota exceeded'}`);
        throw new Error('INSUFFICIENT_FUNDS');
      }
    }
    this.logger.error(`OpenAI ${context} Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

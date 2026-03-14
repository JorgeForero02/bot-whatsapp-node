import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CredentialService } from '../credentials/credential.service';
import { SettingsService } from '../settings/settings.service';
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
    private readonly settings: SettingsService,
  ) {}


  private async getApiKey(): Promise<string> {
    const creds = await this.credentials.getOpenAICredentials();
    return creds.apiKey;
  }

  async createEmbedding(text: string): Promise<number[]> {
    const apiKey = await this.getApiKey();
    const model =
      (await this.settings.get('openai_embedding_model')) ??
      this.config.get<string>('openai.embeddingModel') ??
      'text-embedding-ada-002';

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

  private buildChatMessages(
    prompt: string,
    context: string,
    systemPrompt: string | null,
    conversationHistory: HistoryMessage[],
  ): ChatMessage[] {
    const defaultSystemPrompt = 'Eres un asistente virtual útil y amigable. Responde de manera clara y concisa basándote en el contexto proporcionado.';
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt ?? defaultSystemPrompt },
    ];

    if (context) {
      messages.push({ role: 'system', content: `Contexto relevante:\n${context}` });
    }

    for (const msg of conversationHistory) {
      if (!msg.message_text) continue;
      messages.push({
        role: msg.sender === 'bot' ? 'assistant' : 'user',
        content: msg.message_text,
      });
    }

    messages.push({ role: 'user', content: prompt });
    return messages;
  }

  private async resolveModel(modelOverride: string | null = null): Promise<string> {
    return (
      modelOverride ??
      (await this.settings.get('openai_model')) ??
      this.config.get<string>('openai.model') ??
      'gpt-3.5-turbo'
    );
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
    const model = await this.resolveModel(modelOverride);
    const messages = this.buildChatMessages(prompt, context, systemPrompt, conversationHistory);

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
    const model = await this.resolveModel();
    const messages = this.buildChatMessages(prompt, context, systemPrompt, conversationHistory);

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    if (tools.length > 0) {
      body['tools'] = tools;
      body['tool_choice'] = 'required';
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
          description: 'Usar cuando el usuario expresa intención de crear una nueva cita. Incluye: palabras explícitas ("agendar", "reservar", "sacar cita"), confirmaciones a preguntas del bot sobre agendar ("sí, quiero", "claro", "ok"), o contexto donde claramente quiere programar algo nuevo. NO usar si ya tiene una cita y quiere modificarla o verla.',
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
          description: 'Usar cuando el usuario pregunta por horarios disponibles o disponibilidad SIN confirmar que quiere agendar. Ejemplos: "¿qué horarios tienes?", "¿hay disponibilidad el martes?", "¿cuándo puedes atenderme?". Si después de preguntar confirma que quiere agendar, usar schedule_appointment.',
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
          description: 'Usar cuando el usuario quiere VER o CONSULTAR sus citas existentes sin intención de modificarlas. Incluye: "ver mis citas", "cuáles son mis citas", "mis próximas citas", "tengo alguna cita", o preguntas sobre sus eventos programados. NO usar si menciona modificar, cancelar o reagendar (aunque pregunte primero por sus citas).',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
      {
        type: 'function',
        function: {
          name: 'reschedule_appointment',
          description: 'Usar cuando el usuario quiere MODIFICAR una cita existente cambiando su fecha u hora. Incluye: palabras explícitas ("reagendar", "mover", "cambiar fecha/hora", "reprogramar"), contexto donde tiene una cita pero no puede asistir y quiere otra fecha, o confirmaciones a preguntas del bot sobre mover una cita. Usar incluso si primero pregunta "¿puedo cambiar mi cita?" y luego confirma.',
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
          description: 'Usar cuando el usuario quiere ELIMINAR definitivamente una cita sin reprogramarla. Incluye: palabras explícitas ("cancelar", "eliminar", "borrar", "anular cita"), contexto donde no puede asistir y NO menciona querer otra fecha, o confirmaciones a preguntas del bot sobre cancelar. NO usar si dice que quiere cambiar la fecha (eso es reschedule).',
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
      try { await unlink(tempPath); } catch { }
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
      this.logger.error(`OpenAI ${context} HTTP ${status}: ${msg ?? JSON.stringify(resp.response?.data)}`);
    }
    this.logger.error(`OpenAI ${context} Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

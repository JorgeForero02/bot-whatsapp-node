import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CredentialService } from '../credentials/credential.service';

export interface ParsedMessage {
  from: string;
  text: string;
  messageId: string;
  timestamp: number;
  contactName: string;
  type: string;
  audioId?: string;
  mimeType?: string;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly credentials: CredentialService,
  ) {}

  async sendMessage(to: string, message: string): Promise<string | null> {
    try {
      const creds = await this.credentials.getWhatsAppCredentials();
      const apiVersion = this.config.get<string>('whatsapp.apiVersion') ?? 'v18.0';
      const url = `${this.config.get<string>('whatsapp.baseUrl')}/${apiVersion}/${creds.phoneNumberId}/messages`;

      const { data } = await firstValueFrom(
        this.http.post(url, {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        }, {
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      const messageId = (data as { messages?: Array<{ id: string }> }).messages?.[0]?.id ?? null;
      this.logger.log(`WhatsApp: Message sent to=${to} id=${messageId}`);
      return messageId;
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: unknown; status?: number } };
      const detail = axiosError?.response?.data ?? (error instanceof Error ? error.message : '');
      this.logger.error(`WhatsApp Send Message Error (status=${axiosError?.response?.status})`, JSON.stringify(detail));
      return null;
    }
  }

  async getMediaUrl(mediaId: string): Promise<string | null> {
    try {
      const creds = await this.credentials.getWhatsAppCredentials();
      const apiVersion = this.config.get<string>('whatsapp.apiVersion') ?? 'v18.0';
      const url = `${this.config.get<string>('whatsapp.baseUrl')}/${apiVersion}/${mediaId}`;

      const { data } = await firstValueFrom(
        this.http.get(url, {
          headers: { Authorization: `Bearer ${creds.accessToken}` },
        }),
      );

      return (data as { url?: string }).url ?? null;
    } catch (error: unknown) {
      this.logger.error('WhatsApp Get Media URL Error', error instanceof Error ? error.message : '');
      return null;
    }
  }

  async downloadMedia(mediaId: string): Promise<Buffer> {
    const mediaUrl = await this.getMediaUrl(mediaId);
    if (!mediaUrl) throw new Error('Media URL not found');

    try {
      const creds = await this.credentials.getWhatsAppCredentials();
      const { data } = await firstValueFrom(
        this.http.get<ArrayBuffer>(mediaUrl, {
          headers: { Authorization: `Bearer ${creds.accessToken}` },
          responseType: 'arraybuffer',
        }),
      );

      return Buffer.from(data);
    } catch (error: unknown) {
      this.logger.error('WhatsApp Download Media Error', error instanceof Error ? error.message : '');
      throw error; // re-throw so audio handler can send fallback message
    }
  }

  async markAsRead(messageId: string): Promise<boolean> {
    try {
      const creds = await this.credentials.getWhatsAppCredentials();
      const apiVersion = this.config.get<string>('whatsapp.apiVersion') ?? 'v18.0';
      const url = `${this.config.get<string>('whatsapp.baseUrl')}/${apiVersion}/${creds.phoneNumberId}/messages`;

      await firstValueFrom(
        this.http.post(url, {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }, {
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );
      return true;
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: unknown; status?: number } };
      const detail = axiosError?.response?.data ?? (error instanceof Error ? error.message : '');
      this.logger.error(`WhatsApp Mark Read Error (status=${axiosError?.response?.status})`, JSON.stringify(detail));
      return false;
    }
  }

  verifyWebhook(mode: string, token: string, challenge: string, verifyToken: string): string | false {
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    return false;
  }

  parseWebhookPayload(payload: Record<string, unknown>): ParsedMessage | null {
    const entry = payload['entry'] as Array<Record<string, unknown>> | undefined;
    if (!entry?.[0]) return null;

    const changes = (entry[0]['changes'] as Array<Record<string, unknown>> | undefined);
    if (!changes?.[0]) return null;

    const value = changes[0]['value'] as Record<string, unknown> | undefined;
    if (!value) return null;

    const messages = value['messages'] as Array<Record<string, unknown>> | undefined;
    if (!messages?.[0]) return null;

    const message = messages[0];
    const messageType = (message['type'] as string) ?? 'text';

    const contacts = value['contacts'] as Array<{ profile?: { name?: string } }> | undefined;
    const contactName = contacts?.[0]?.profile?.name ?? 'Unknown';

    const result: ParsedMessage = {
      from: (message['from'] as string) ?? '',
      text: '',
      messageId: (message['id'] as string) ?? '',
      timestamp: Number(message['timestamp'] ?? Math.floor(Date.now() / 1000)),
      contactName,
      type: messageType,
    };

    if (messageType === 'text') {
      const textObj = message['text'] as { body?: string } | undefined;
      result.text = textObj?.body ?? '';
    } else if (messageType === 'audio') {
      const audioObj = message['audio'] as { id?: string; mime_type?: string } | undefined;
      result.audioId = audioObj?.id;
      result.mimeType = audioObj?.mime_type ?? 'audio/ogg';
    }

    return result;
  }
}

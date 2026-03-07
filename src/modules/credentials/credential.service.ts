import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { EncryptionService } from '../encryption/encryption.service';
import { botCredentials } from '../database/schema/bot-credentials.schema';
import { googleOauthCredentials } from '../database/schema/google-oauth-credentials.schema';

export interface WhatsAppCredentials {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  appSecret: string;
}

export interface OpenAICredentials {
  apiKey: string;
}

export interface GoogleOAuthCreds {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  calendarId: string;
}

@Injectable()
export class CredentialService {
  private readonly logger = new Logger(CredentialService.name);
  private whatsappCache: WhatsAppCredentials | null = null;
  private openaiCache: OpenAICredentials | null = null;
  private googleCache: GoogleOAuthCreds | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly encryption: EncryptionService,
    private readonly config: ConfigService,
  ) {}

  async getWhatsAppCredentials(): Promise<WhatsAppCredentials> {
    if (this.whatsappCache) return this.whatsappCache;

    try {
      const row = await this.db.db
        .select()
        .from(botCredentials)
        .where(eq(botCredentials.id, 1))
        .limit(1);

      if (row.length > 0 && row[0].whatsappAccessToken) {
        this.whatsappCache = {
          accessToken: this.encryption.decryptSafe(row[0].whatsappAccessToken ?? ''),
          phoneNumberId: this.encryption.decryptSafe(row[0].whatsappPhoneNumberId ?? ''),
          verifyToken: this.encryption.decryptSafe(row[0].whatsappVerifyToken ?? ''),
          appSecret: this.encryption.decryptSafe(row[0].whatsappAppSecret ?? ''),
        };
        return this.whatsappCache;
      }
    } catch (error: unknown) {
      this.logger.warn('Failed to load WhatsApp creds from DB, using env', error instanceof Error ? error.message : '');
    }

    this.whatsappCache = {
      accessToken: this.config.get<string>('whatsapp.accessToken') ?? '',
      phoneNumberId: this.config.get<string>('whatsapp.phoneNumberId') ?? '',
      verifyToken: this.config.get<string>('whatsapp.verifyToken') ?? '',
      appSecret: this.config.get<string>('whatsapp.appSecret') ?? '',
    };
    return this.whatsappCache;
  }

  async getOpenAICredentials(): Promise<OpenAICredentials> {
    if (this.openaiCache) return this.openaiCache;

    try {
      const row = await this.db.db
        .select()
        .from(botCredentials)
        .where(eq(botCredentials.id, 1))
        .limit(1);

      if (row.length > 0 && row[0].openaiApiKey) {
        this.openaiCache = {
          apiKey: this.encryption.decryptSafe(row[0].openaiApiKey ?? ''),
        };
        return this.openaiCache;
      }
    } catch (error: unknown) {
      this.logger.warn('Failed to load OpenAI creds from DB, using env', error instanceof Error ? error.message : '');
    }

    this.openaiCache = {
      apiKey: this.config.get<string>('openai.apiKey') ?? '',
    };
    return this.openaiCache;
  }

  async getGoogleOAuthCredentials(): Promise<GoogleOAuthCreds> {
    if (this.googleCache) return this.googleCache;

    try {
      const row = await this.db.db
        .select()
        .from(googleOauthCredentials)
        .where(eq(googleOauthCredentials.id, 1))
        .limit(1);

      if (row.length > 0 && row[0].accessToken) {
        this.googleCache = {
          accessToken: this.encryption.decryptSafe(row[0].accessToken ?? ''),
          refreshToken: this.encryption.decryptSafe(row[0].refreshToken ?? ''),
          clientId: this.encryption.decryptSafe(row[0].clientId ?? ''),
          clientSecret: this.encryption.decryptSafe(row[0].clientSecret ?? ''),
          calendarId: row[0].calendarId ?? this.config.get<string>('google.calendarId') ?? 'primary',
        };
        return this.googleCache;
      }
    } catch (error: unknown) {
      this.logger.warn('Failed to load Google creds from DB, using env', error instanceof Error ? error.message : '');
    }

    this.googleCache = {
      accessToken: this.config.get<string>('google.accessToken') ?? '',
      refreshToken: this.config.get<string>('google.refreshToken') ?? '',
      clientId: this.config.get<string>('google.clientId') ?? '',
      clientSecret: this.config.get<string>('google.clientSecret') ?? '',
      calendarId: this.config.get<string>('google.calendarId') ?? 'primary',
    };
    return this.googleCache;
  }

  async saveWhatsAppCredentials(creds: Partial<WhatsAppCredentials>): Promise<void> {
    const data: Record<string, string> = {};
    if (creds.accessToken) data['whatsapp_access_token'] = this.encryption.encrypt(creds.accessToken);
    if (creds.phoneNumberId) data['whatsapp_phone_number_id'] = this.encryption.encrypt(creds.phoneNumberId);
    if (creds.verifyToken) data['whatsapp_verify_token'] = this.encryption.encrypt(creds.verifyToken);
    if (creds.appSecret) data['whatsapp_app_secret'] = this.encryption.encrypt(creds.appSecret);

    await this.db.db
      .update(botCredentials)
      .set(data)
      .where(eq(botCredentials.id, 1));

    this.whatsappCache = null;
  }

  async saveOpenAICredentials(creds: Partial<OpenAICredentials>): Promise<void> {
    if (creds.apiKey) {
      await this.db.db
        .update(botCredentials)
        .set({ openaiApiKey: this.encryption.encrypt(creds.apiKey) })
        .where(eq(botCredentials.id, 1));
    }
    this.openaiCache = null;
  }

  async saveGoogleOAuthCredentials(creds: Partial<GoogleOAuthCreds>): Promise<void> {
    const data: Record<string, string> = {};
    if (creds.accessToken) data['access_token'] = this.encryption.encrypt(creds.accessToken);
    if (creds.refreshToken) data['refresh_token'] = this.encryption.encrypt(creds.refreshToken);
    if (creds.clientId) data['client_id'] = this.encryption.encrypt(creds.clientId);
    if (creds.clientSecret) data['client_secret'] = this.encryption.encrypt(creds.clientSecret);
    if (creds.calendarId) data['calendar_id'] = creds.calendarId;

    await this.db.db
      .update(googleOauthCredentials)
      .set(data)
      .where(eq(googleOauthCredentials.id, 1));

    this.googleCache = null;
  }

  invalidateCache(): void {
    this.whatsappCache = null;
    this.openaiCache = null;
    this.googleCache = null;
  }
}

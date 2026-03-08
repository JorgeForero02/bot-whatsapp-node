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

  private async ensureBotCredentialsRow(): Promise<void> {
    const existing = await this.db.db
      .select({ id: botCredentials.id })
      .from(botCredentials)
      .where(eq(botCredentials.id, 1))
      .limit(1);

    if (existing.length === 0) {
      await this.db.db.insert(botCredentials).values({ id: 1 }).onDuplicateKeyUpdate({ set: { id: 1 } });
    }
  }

  private async ensureGoogleRow(): Promise<void> {
    const existing = await this.db.db
      .select({ id: googleOauthCredentials.id })
      .from(googleOauthCredentials)
      .where(eq(googleOauthCredentials.id, 1))
      .limit(1);

    if (existing.length === 0) {
      await this.db.db.insert(googleOauthCredentials).values({ id: 1 }).onDuplicateKeyUpdate({ set: { id: 1 } });
    }
  }

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
    await this.ensureBotCredentialsRow();
    const data: Partial<typeof botCredentials.$inferInsert> = {};

    if (creds.accessToken) data.whatsappAccessToken = this.encryption.encrypt(creds.accessToken);
    if (creds.phoneNumberId) data.whatsappPhoneNumberId = this.encryption.encrypt(creds.phoneNumberId);
    if (creds.verifyToken) data.whatsappVerifyToken = this.encryption.encrypt(creds.verifyToken);
    if (creds.appSecret) data.whatsappAppSecret = this.encryption.encrypt(creds.appSecret);

    if (Object.keys(data).length === 0) return;

    await this.db.db
      .update(botCredentials)
      .set(data)
      .where(eq(botCredentials.id, 1));

    this.whatsappCache = null;
  }

  async saveOpenAICredentials(creds: Partial<OpenAICredentials>): Promise<void> {
    await this.ensureBotCredentialsRow();
    if (creds.apiKey) {
      await this.db.db
        .update(botCredentials)
        .set({ openaiApiKey: this.encryption.encrypt(creds.apiKey) })
        .where(eq(botCredentials.id, 1));
    }
    this.openaiCache = null;
  }

  async saveGoogleOAuthCredentials(creds: Partial<GoogleOAuthCreds>): Promise<void> {
    await this.ensureGoogleRow();
    const data: Partial<typeof googleOauthCredentials.$inferInsert> = {};

    if (creds.accessToken) data.accessToken = this.encryption.encrypt(creds.accessToken);
    if (creds.refreshToken) data.refreshToken = this.encryption.encrypt(creds.refreshToken);
    if (creds.clientId) data.clientId = this.encryption.encrypt(creds.clientId);
    if (creds.clientSecret) data.clientSecret = this.encryption.encrypt(creds.clientSecret);
    if (creds.calendarId) data.calendarId = creds.calendarId;

    if (Object.keys(data).length === 0) return;

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

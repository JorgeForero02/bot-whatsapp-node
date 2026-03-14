import { Controller, Get, Post, Body, Query, Logger, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiAuthGuard } from '../../common/guards/api-auth.guard';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { CredentialService } from '../credentials/credential.service';
import { GoogleCalendarService } from '../calendar/google-calendar.service';

@UseGuards(ApiAuthGuard)
@Controller('api')
export class ApiCredentialsController {
  private readonly logger = new Logger(ApiCredentialsController.name);

  constructor(
    private readonly credentials: CredentialService,
    private readonly googleCalendar: GoogleCalendarService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  @Post('credentials/whatsapp')
  @HttpCode(HttpStatus.OK)
  async saveWhatsAppCredentials(
    @Body() body: { accessToken?: string; phoneNumberId?: string; verifyToken?: string; appSecret?: string },
  ): Promise<Record<string, unknown>> {
    await this.credentials.saveWhatsAppCredentials(body);
    return { success: true };
  }

  @Post('credentials/openai')
  @HttpCode(HttpStatus.OK)
  async saveOpenAICredentials(
    @Body() body: { apiKey?: string },
  ): Promise<Record<string, unknown>> {
    await this.credentials.saveOpenAICredentials(body);
    return { success: true };
  }

  @Post('credentials/google')
  @HttpCode(HttpStatus.OK)
  async saveGoogleCredentials(
    @Body() body: { accessToken?: string; refreshToken?: string; clientId?: string; clientSecret?: string; calendarId?: string },
  ): Promise<Record<string, unknown>> {
    await this.credentials.saveGoogleOAuthCredentials(body);
    return { success: true };
  }

  @Get('credentials')
  async getCredentials(): Promise<Record<string, unknown>> {
    let whatsapp = { configured: false };
    let openai = { configured: false };
    let google = { configured: false };

    try {
      const wa = await this.credentials.getWhatsAppCredentials();
      whatsapp = { configured: !!(wa.accessToken && wa.phoneNumberId) } as typeof whatsapp;
    } catch { }

    try {
      const oa = await this.credentials.getOpenAICredentials();
      openai = { configured: !!oa.apiKey } as typeof openai;
    } catch { }

    try {
      const go = await this.credentials.getGoogleOAuthCredentials();
      google = { configured: !!(go.clientId && (go.accessToken || go.refreshToken)) } as typeof google;
    } catch { }

    return { success: true, data: { whatsapp, openai, google } };
  }

  @Get('test-connection')
  async testConnection(@Query('service') service?: string): Promise<Record<string, unknown>> {
    try {
      if (service === 'openai') {
        const creds = await this.credentials.getOpenAICredentials();
        if (!creds.apiKey) {
          return { success: false, error: 'OpenAI API key no configurado' };
        }
        try {
          await this.http.axiosRef.get(
            'https://api.openai.com/v1/models',
            {
              headers: { Authorization: `Bearer ${creds.apiKey}` },
              timeout: 5000,
            }
          );
          return { success: true, message: 'OpenAI configurado correctamente' };
        } catch (error: unknown) {
          const axiosError = error as { response?: { data?: { error?: { message?: string } }; status?: number } };
          const errorMsg = axiosError?.response?.data?.error?.message || 'API key inválida o sin permisos';
          return { success: false, error: `OpenAI: ${errorMsg}` };
        }
      }
      if (service === 'google') {
        const creds = await this.credentials.getGoogleOAuthCredentials();
        if (!creds.clientId || (!creds.accessToken && !creds.refreshToken)) {
          return { success: false, error: 'Credenciales de Google no configuradas' };
        }
        try {
          const result = await this.googleCalendar.listUpcomingEvents(1);
          if (result || result === null) {
            return { success: true, message: 'Google Calendar configurado correctamente' };
          }
          return { success: false, error: 'No se pudo conectar con Google Calendar' };
        } catch (error: unknown) {
          const axiosError = error as { response?: { data?: { error?: { message?: string } }; status?: number } };
          const errorMsg = axiosError?.response?.data?.error?.message || 'Credenciales inválidas o expiradas';
          return { success: false, error: `Google Calendar: ${errorMsg}` };
        }
      }
      const creds = await this.credentials.getWhatsAppCredentials();
      if (!creds.accessToken || !creds.phoneNumberId) {
        return { success: false, error: 'Credenciales de WhatsApp no configuradas' };
      }
      try {
        const apiVersion = this.config.get<string>('whatsapp.apiVersion') ?? 'v18.0';
        const baseUrl = this.config.get<string>('whatsapp.baseUrl') ?? 'https://graph.facebook.com';
        await this.http.axiosRef.get(
          `${baseUrl}/${apiVersion}/${creds.phoneNumberId}`,
          {
            headers: { Authorization: `Bearer ${creds.accessToken}` },
            timeout: 5000,
          }
        );
        return { success: true, message: 'WhatsApp configurado correctamente' };
      } catch (error: unknown) {
        const axiosError = error as { response?: { data?: { error?: { message?: string } }; status?: number } };
        const errorMsg = axiosError?.response?.data?.error?.message || 'Token inválido o sin permisos';
        return { success: false, error: `WhatsApp: ${errorMsg}` };
      }
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }

  @Get('check-openai-status')
  async checkOpenAIStatus(): Promise<Record<string, unknown>> {
    try {
      const creds = await this.credentials.getOpenAICredentials();
      if (!creds.apiKey) {
        return { success: true, data: { configured: false, status: 'No API key configured' } };
      }
      return { success: true, data: { configured: true, status: 'API key configured' } };
    } catch (error: unknown) {
      return { success: true, data: { configured: false, status: error instanceof Error ? error.message : 'Error' } };
    }
  }
}

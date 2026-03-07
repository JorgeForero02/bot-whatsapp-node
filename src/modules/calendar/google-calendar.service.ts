import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CredentialService } from '../credentials/credential.service';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email: string }>;
}

export interface CalendarConfig {
  timezone: string;
  defaultDuration: number;
  maxEventsPerDay: number;
  minAdvanceHours: number;
  reminders: {
    email?: { enabled: boolean; minutes_before: number };
    popup?: { enabled: boolean; minutes_before: number };
  };
  businessHours: Record<string, { start: string; end: string } | null>;
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly baseUrl = 'https://www.googleapis.com/calendar/v3';
  private accessToken = '';
  private refreshToken = '';
  private clientId = '';
  private clientSecret = '';
  private calendarId = 'primary';
  private timezone = 'America/Bogota';
  private initialized = false;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly credentials: CredentialService,
  ) {}

  private async init(): Promise<void> {
    if (this.initialized) return;
    const creds = await this.credentials.getGoogleOAuthCredentials();
    this.accessToken = creds.accessToken;
    this.refreshToken = creds.refreshToken;
    this.clientId = creds.clientId;
    this.clientSecret = creds.clientSecret;
    this.calendarId = creds.calendarId || 'primary';
    this.timezone = this.config.get<string>('app.timezone') ?? 'America/Bogota';
    this.initialized = true;
  }

  private async makeRequest<T = Record<string, unknown>>(
    method: 'get' | 'post' | 'patch' | 'delete',
    endpoint: string,
    options: { params?: Record<string, string | number | boolean>; data?: Record<string, unknown> } = {},
  ): Promise<T> {
    await this.init();
    const url = `${this.baseUrl}/${endpoint}`;
    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };

    try {
      const { data } = await firstValueFrom(
        method === 'get'
          ? this.http.get<T>(url, { headers, params: options.params })
          : method === 'delete'
            ? this.http.delete<T>(url, { headers })
            : this.http[method]<T>(url, options.data ?? {}, { headers }),
      );
      return data;
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 && (await this.refreshAccessToken())) {
        const retryHeaders = { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' };
        const { data } = await firstValueFrom(
          method === 'get'
            ? this.http.get<T>(url, { headers: retryHeaders, params: options.params })
            : method === 'delete'
              ? this.http.delete<T>(url, { headers: retryHeaders })
              : this.http[method]<T>(url, options.data ?? {}, { headers: retryHeaders }),
        );
        return data;
      }
      throw error;
    }
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken || !this.clientId || !this.clientSecret) return false;
    try {
      const { data } = await firstValueFrom(
        this.http.post<{ access_token?: string }>('https://oauth2.googleapis.com/token', null, {
          params: {
            client_id: this.clientId,
            client_secret: this.clientSecret,
            refresh_token: this.refreshToken,
            grant_type: 'refresh_token',
          },
        }),
      );
      if (data.access_token) {
        this.accessToken = data.access_token;
        try {
          await this.credentials.saveGoogleOAuthCredentials({ accessToken: this.accessToken });
        } catch { /* ignore persist error */ }
        this.logger.log('Access token refreshed');
        return true;
      }
      return false;
    } catch (error: unknown) {
      this.logger.error('Failed to refresh token', error instanceof Error ? error.message : '');
      return false;
    }
  }

  async listUpcomingEvents(maxResults = 10): Promise<{ items?: CalendarEvent[] }> {
    return this.makeRequest('get', `calendars/${encodeURIComponent(this.calendarId)}/events`, {
      params: {
        maxResults,
        timeMin: new Date().toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      },
    });
  }

  async checkAvailability(date: string, startHour: number, endHour: number): Promise<boolean> {
    const timeMin = this.toRfc3339(`${date} ${String(startHour).padStart(2, '0')}:00:00`);
    const timeMax = this.toRfc3339(`${date} ${String(endHour).padStart(2, '0')}:00:00`);
    const data = await this.makeRequest<{ items?: CalendarEvent[] }>(
      'get',
      `calendars/${encodeURIComponent(this.calendarId)}/events`,
      { params: { timeMin, timeMax, singleEvents: true, orderBy: 'startTime' } },
    );
    return !data.items || data.items.length === 0;
  }

  async createEvent(
    summary: string,
    description: string,
    startDateTime: string,
    endDateTime: string,
    attendeeEmail?: string,
    calendarConfig?: CalendarConfig,
  ): Promise<CalendarEvent> {
    const reminders = this.buildReminders(calendarConfig);
    const event: Record<string, unknown> = {
      summary,
      description,
      start: { dateTime: startDateTime, timeZone: this.timezone },
      end: { dateTime: endDateTime, timeZone: this.timezone },
      reminders,
    };
    if (attendeeEmail) {
      event['attendees'] = [{ email: attendeeEmail }];
    }
    return this.makeRequest<CalendarEvent>(
      'post',
      `calendars/${encodeURIComponent(this.calendarId)}/events`,
      { data: event },
    );
  }

  async checkEventOverlap(date: string, startTime: string, endTime: string): Promise<{ overlap: boolean; events: CalendarEvent[] }> {
    const timeMin = this.toRfc3339(`${date} ${startTime}`);
    const timeMax = this.toRfc3339(`${date} ${endTime}`);
    const data = await this.makeRequest<{ items?: CalendarEvent[] }>(
      'get',
      `calendars/${encodeURIComponent(this.calendarId)}/events`,
      { params: { timeMin, timeMax, singleEvents: true, orderBy: 'startTime' } },
    );
    const items = data.items ?? [];
    return { overlap: items.length > 0, events: items };
  }

  async rescheduleEvent(eventId: string, newStart: string, newEnd: string): Promise<CalendarEvent> {
    return this.makeRequest<CalendarEvent>(
      'patch',
      `calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(eventId)}`,
      { data: { start: { dateTime: newStart, timeZone: this.timezone }, end: { dateTime: newEnd, timeZone: this.timezone } } },
    );
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.makeRequest(
      'delete',
      `calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
    this.logger.log(`Event deleted: ${eventId}`);
  }

  async getEventsByDateRange(startDate: string, endDate: string, maxResults = 50): Promise<{ items?: CalendarEvent[] }> {
    const timeMin = this.toRfc3339(`${startDate} 00:00:00`);
    const timeMax = this.toRfc3339(`${endDate} 23:59:59`);
    return this.makeRequest('get', `calendars/${encodeURIComponent(this.calendarId)}/events`, {
      params: { timeMin, timeMax, maxResults, singleEvents: true, orderBy: 'startTime' },
    });
  }

  async countEventsForDay(date: string): Promise<number> {
    try {
      const data = await this.getEventsByDateRange(date, date);
      return data.items?.length ?? 0;
    } catch {
      return 0;
    }
  }

  validateDateFormat(dateText: string): string | null {
    const numericMatch = dateText.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
    if (numericMatch) {
      const day = parseInt(numericMatch[1], 10);
      const month = parseInt(numericMatch[2], 10);
      const year = parseInt(numericMatch[3], 10);
      if (this.isValidDate(year, month, day)) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    const months: Record<string, number> = {
      enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
      julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
    };

    for (const [name, num] of Object.entries(months)) {
      const fullMatch = dateText.match(new RegExp(`(\\d{1,2})\\s+de\\s+${name}\\s+(?:del?\\s+)?(\\d{4})`, 'i'));
      if (fullMatch) {
        const day = parseInt(fullMatch[1], 10);
        const year = parseInt(fullMatch[2], 10);
        if (this.isValidDate(year, num, day)) {
          return `${year}-${String(num).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
      const partialMatch = dateText.match(new RegExp(`(\\d{1,2})\\s+de\\s+${name}(?:\\s|$)`, 'i'));
      if (partialMatch) {
        const day = parseInt(partialMatch[1], 10);
        const now = new Date();
        let year = now.getFullYear();
        if (!this.isValidDate(year, num, day)) continue;
        const candidate = new Date(year, num - 1, day);
        if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          candidate.setFullYear(candidate.getFullYear() + 1);
        }
        return `${candidate.getFullYear()}-${String(num).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    const lower = dateText.toLowerCase();
    const now = new Date();
    if (lower.includes('pasado mañana')) {
      const d = new Date(now); d.setDate(d.getDate() + 2);
      return d.toISOString().slice(0, 10);
    }
    if (lower.includes('mañana')) {
      const d = new Date(now); d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    }
    if (lower.includes('hoy')) {
      return now.toISOString().slice(0, 10);
    }

    return null;
  }

  validateDateNotPast(dateString: string): { valid: boolean; message?: string } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const requested = new Date(dateString + 'T00:00:00');
    if (requested < today) {
      return { valid: false, message: 'Esa fecha ya pasó. Por favor indica una fecha futura válida.' };
    }
    return { valid: true };
  }

  validateMinAdvanceHours(date: string, time: string, minAdvanceHours: number): { valid: boolean; message?: string } {
    const requested = new Date(`${date}T${time}:00`);
    const minTime = new Date(Date.now() + minAdvanceHours * 3600000);
    if (requested < minTime) {
      return { valid: false, message: `Las citas requieren al menos ${minAdvanceHours} hora(s) de antelación.` };
    }
    return { valid: true };
  }

  validateBusinessHours(
    date: string,
    time: string,
    businessHours: Record<string, { start: string; end: string } | null>,
  ): { valid: boolean; reason?: string } {
    const dt = new Date(`${date}T${time}:00`);
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayOfWeek = dayNames[dt.getDay()];
    const hours = businessHours[dayOfWeek];
    if (!hours) return { valid: false, reason: 'No atendemos ese día' };
    const requestedTime = time.slice(0, 5);
    if (requestedTime < hours.start || requestedTime >= hours.end) {
      return { valid: false, reason: `Horario fuera de atención. Atendemos de ${hours.start} a ${hours.end}` };
    }
    return { valid: true };
  }

  formatEventsForWhatsApp(events: CalendarEvent[]): string {
    if (!events || events.length === 0) return 'No hay eventos próximos agendados.';
    let msg = '*Próximos eventos:*\n\n';
    events.forEach((event, i) => {
      const startStr = event.start.dateTime ?? event.start.date ?? '';
      const start = new Date(startStr);
      const day = String(start.getDate()).padStart(2, '0');
      const month = String(start.getMonth() + 1).padStart(2, '0');
      const year = start.getFullYear();
      const hours = String(start.getHours()).padStart(2, '0');
      const mins = String(start.getMinutes()).padStart(2, '0');
      msg += `${i + 1}. *${event.summary || 'Sin título'}*\n`;
      msg += `   ${day}/${month}/${year} ${hours}:${mins}\n`;
      if (event.description) {
        msg += `   ${event.description.substring(0, 50)}...\n`;
      }
      msg += '\n';
    });
    return msg;
  }

  getTimezone(): string {
    return this.timezone;
  }

  private toRfc3339(dateTimeStr: string): string {
    const dt = new Date(dateTimeStr);
    return dt.toISOString();
  }

  private isValidDate(year: number, month: number, day: number): boolean {
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
  }

  private buildReminders(config?: CalendarConfig): Record<string, unknown> {
    if (!config?.reminders) return { useDefault: true };
    const overrides: Array<{ method: string; minutes: number }> = [];
    if (config.reminders.email?.enabled) {
      overrides.push({ method: 'email', minutes: config.reminders.email.minutes_before ?? 1440 });
    }
    if (config.reminders.popup?.enabled) {
      overrides.push({ method: 'popup', minutes: config.reminders.popup.minutes_before ?? 30 });
    }
    if (overrides.length === 0) return { useDefault: true };
    return { useDefault: false, overrides };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { GoogleCalendarService } from './google-calendar.service';
import { classicCalendarSessions } from '../database/schema/classic-calendar-sessions.schema';
import { loadCalendarConfig } from './calendar-config.helper';
import type { CalendarConfig } from './google-calendar.service';

const SESSION_EXPIRY_MINUTES = 30;

type ClassicStep =
  | 'main_menu'
  | 'schedule_date'
  | 'schedule_time'
  | 'schedule_confirm'
  | 'cancel_select'
  | 'reschedule_select'
  | 'reschedule_date'
  | 'reschedule_time';

interface SessionState {
  id: number;
  userPhone: string;
  currentStep: ClassicStep;
  sessionData: Record<string, unknown>;
  expiresAt: Date;
}

@Injectable()
export class ClassicCalendarFlowHandler {
  private readonly logger = new Logger(ClassicCalendarFlowHandler.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly calendar: GoogleCalendarService,
  ) {}

  async handleMessage(userPhone: string, userText: string, contactName: string): Promise<string | null> {
    const session = await this.getSession(userPhone);

    if (session) {
      if (new Date() > session.expiresAt) {
        await this.clearSession(userPhone);
        return '⏰ Tu sesión de calendario expiró. Escribe "calendario" para empezar de nuevo.';
      }
      return this.continueSession(session, userText, contactName);
    }

    return null;
  }

  async startCalendarMenu(userPhone: string): Promise<string> {
    await this.createSession(userPhone, 'main_menu', {});
    return (
      '📅 *Menú de Calendario*\n\n' +
      '1️⃣ Agendar cita\n' +
      '2️⃣ Ver mis eventos\n' +
      '3️⃣ Cancelar evento\n' +
      '4️⃣ Reagendar evento\n\n' +
      'Responde con el número de la opción.'
    );
  }

  private async continueSession(session: SessionState, userText: string, contactName: string): Promise<string> {
    const config = await loadCalendarConfig(this.db);

    switch (session.currentStep) {
      case 'main_menu':
        return this.handleMainMenu(session, userText, contactName, config);
      case 'schedule_date':
        return this.handleScheduleDate(session, userText, config);
      case 'schedule_time':
        return this.handleScheduleTime(session, userText, contactName, config);
      case 'schedule_confirm':
        return this.handleScheduleConfirm(session, userText, contactName, config);
      case 'cancel_select':
        return this.handleCancelSelect(session, userText);
      case 'reschedule_select':
        return this.handleRescheduleSelect(session, userText);
      case 'reschedule_date':
        return this.handleRescheduleDate(session, userText, config);
      case 'reschedule_time':
        return this.handleRescheduleTime(session, userText, config);
      default:
        await this.clearSession(session.userPhone);
        return 'Sesión inválida. Escribe "calendario" para empezar de nuevo.';
    }
  }

  private async handleMainMenu(session: SessionState, userText: string, contactName: string, config: CalendarConfig): Promise<string> {
    const choice = userText.trim();

    switch (choice) {
      case '1': {
        await this.updateSession(session.userPhone, 'schedule_date', {});
        return '📅 ¿Para qué fecha deseas agendar? (Ej: 25/03/2026, mañana, 15 de abril)';
      }
      case '2': {
        try {
          const events = await this.calendar.listUpcomingEvents(10);
          await this.clearSession(session.userPhone);
          return this.calendar.formatEventsForWhatsApp(events.items ?? []);
        } catch {
          await this.clearSession(session.userPhone);
          return '❌ No pude consultar tus eventos. Intenta de nuevo.';
        }
      }
      case '3': {
        try {
          const events = await this.calendar.listUpcomingEvents(10);
          const items = events.items ?? [];
          if (items.length === 0) {
            await this.clearSession(session.userPhone);
            return 'No tienes eventos próximos para cancelar.';
          }
          await this.updateSession(session.userPhone, 'cancel_select', { events: items });
          let msg = '¿Cuál evento deseas cancelar?\n\n';
          items.forEach((e, i) => {
            const start = new Date(e.start.dateTime ?? e.start.date ?? '');
            msg += `${i + 1}. *${e.summary}* — ${this.formatDateTime(start)}\n`;
          });
          msg += '\nResponde con el número.';
          return msg;
        } catch {
          await this.clearSession(session.userPhone);
          return '❌ No pude obtener tus eventos.';
        }
      }
      case '4': {
        try {
          const events = await this.calendar.listUpcomingEvents(10);
          const items = events.items ?? [];
          if (items.length === 0) {
            await this.clearSession(session.userPhone);
            return 'No tienes eventos próximos para reagendar.';
          }
          await this.updateSession(session.userPhone, 'reschedule_select', { events: items });
          let msg = '¿Cuál evento deseas reagendar?\n\n';
          items.forEach((e, i) => {
            const start = new Date(e.start.dateTime ?? e.start.date ?? '');
            msg += `${i + 1}. *${e.summary}* — ${this.formatDateTime(start)}\n`;
          });
          msg += '\nResponde con el número.';
          return msg;
        } catch {
          await this.clearSession(session.userPhone);
          return '❌ No pude obtener tus eventos.';
        }
      }
      default:
        return 'Por favor responde con 1, 2, 3 o 4.';
    }
  }

  private async handleScheduleDate(session: SessionState, userText: string, config: CalendarConfig): Promise<string> {
    const date = this.calendar.validateDateFormat(userText);
    if (!date) {
      await this.clearSession(session.userPhone);
      return '❌ No entendí la fecha. Escribe "calendario" para intentar de nuevo.';
    }

    const pastCheck = this.calendar.validateDateNotPast(date);
    if (!pastCheck.valid) return pastCheck.message!;

    await this.updateSession(session.userPhone, 'schedule_time', { ...session.sessionData, date });
    return `📅 Fecha: *${this.formatDateSpanish(date)}*. ¿A qué hora? (Ej: 14:00, 3pm)`;
  }

  private async handleScheduleTime(session: SessionState, userText: string, contactName: string, config: CalendarConfig): Promise<string> {
    const time = this.resolveTime(userText);
    if (!time) {
      await this.clearSession(session.userPhone);
      return '❌ No entendí la hora. Escribe "calendario" para intentar de nuevo.';
    }

    const date = session.sessionData['date'] as string;

    if (config.businessHours) {
      const bhCheck = this.calendar.validateBusinessHours(date, time, config.businessHours);
      if (!bhCheck.valid) return `⚠️ ${bhCheck.reason}. Elige otro horario.`;
    }

    const endTime = this.addMinutes(time, config.defaultDuration);
    const overlap = await this.calendar.checkEventOverlap(date, time, endTime);
    if (overlap.overlap) return '⚠️ Ya hay un evento en ese horario. Elige otra hora.';

    await this.updateSession(session.userPhone, 'schedule_confirm', { ...session.sessionData, time });

    return (
      `📋 *Resumen:*\n\n` +
      `📅 ${this.formatDateSpanish(date)}\n` +
      `🕐 ${time}\n` +
      `⏱️ ${config.defaultDuration} min\n\n` +
      `¿Confirmas? (sí/no)`
    );
  }

  private async handleScheduleConfirm(session: SessionState, userText: string, contactName: string, config: CalendarConfig): Promise<string> {
    const lower = userText.trim().toLowerCase();
    const yesWords = ['sí', 'si', 'yes', 'ok', 'dale', 'confirmo', 'claro'];
    const noWords = ['no', 'cancelar', 'nel'];

    if (yesWords.some((w) => lower.includes(w))) {
      const date = session.sessionData['date'] as string;
      const time = session.sessionData['time'] as string;
      const startDt = `${date}T${time}:00`;
      const endDt = `${date}T${this.addMinutes(time, config.defaultDuration)}:00`;

      try {
        await this.calendar.createEvent(
          `Cita - ${contactName}`,
          `Creado desde WhatsApp por ${contactName}`,
          startDt,
          endDt,
          undefined,
          config,
        );
        await this.clearSession(session.userPhone);
        return `✅ ¡Cita agendada!\n📅 ${this.formatDateSpanish(date)}\n🕐 ${time}`;
      } catch {
        await this.clearSession(session.userPhone);
        return '❌ Error al crear la cita. Intenta de nuevo.';
      }
    }

    if (noWords.some((w) => lower.includes(w))) {
      await this.clearSession(session.userPhone);
      return '❌ Cita cancelada.';
    }

    return 'Responde *sí* o *no*.';
  }

  private async handleCancelSelect(session: SessionState, userText: string): Promise<string> {
    const events = (session.sessionData['events'] ?? []) as Array<{ id: string; summary: string }>;
    const idx = parseInt(userText.trim(), 10) - 1;

    if (isNaN(idx) || idx < 0 || idx >= events.length) {
      await this.clearSession(session.userPhone);
      return '❌ Selección inválida. Escribe "calendario" para intentar de nuevo.';
    }

    try {
      await this.calendar.deleteEvent(events[idx].id);
      await this.clearSession(session.userPhone);
      return `✅ Evento *${events[idx].summary}* cancelado.`;
    } catch {
      await this.clearSession(session.userPhone);
      return '❌ No pude cancelar el evento.';
    }
  }

  private async handleRescheduleSelect(session: SessionState, userText: string): Promise<string> {
    const events = (session.sessionData['events'] ?? []) as Array<{ id: string; summary: string }>;
    const idx = parseInt(userText.trim(), 10) - 1;

    if (isNaN(idx) || idx < 0 || idx >= events.length) {
      await this.clearSession(session.userPhone);
      return '❌ Selección inválida.';
    }

    await this.updateSession(session.userPhone, 'reschedule_date', {
      ...session.sessionData,
      eventId: events[idx].id,
      eventSummary: events[idx].summary,
    });
    return `Reagendando *${events[idx].summary}*. ¿Para qué nueva fecha?`;
  }

  private async handleRescheduleDate(session: SessionState, userText: string, config: CalendarConfig): Promise<string> {
    const date = this.calendar.validateDateFormat(userText);
    if (!date) {
      await this.clearSession(session.userPhone);
      return '❌ No entendí la fecha.';
    }

    await this.updateSession(session.userPhone, 'reschedule_time', { ...session.sessionData, newDate: date });
    return `📅 Nueva fecha: *${this.formatDateSpanish(date)}*. ¿A qué hora?`;
  }

  private async handleRescheduleTime(session: SessionState, userText: string, config: CalendarConfig): Promise<string> {
    const time = this.resolveTime(userText);
    if (!time) {
      await this.clearSession(session.userPhone);
      return '❌ No entendí la hora.';
    }

    const date = session.sessionData['newDate'] as string;
    const eventId = session.sessionData['eventId'] as string;
    const startDt = `${date}T${time}:00`;
    const endDt = `${date}T${this.addMinutes(time, config.defaultDuration)}:00`;

    try {
      await this.calendar.rescheduleEvent(eventId, startDt, endDt);
      await this.clearSession(session.userPhone);
      return `✅ Evento reagendado para el *${this.formatDateSpanish(date)}* a las *${time}*.`;
    } catch {
      await this.clearSession(session.userPhone);
      return '❌ No pude reagendar el evento.';
    }
  }

  // ── Helpers ──

  private resolveTime(text: string): string | null {
    const t = text.trim().toLowerCase();
    const match24 = t.match(/(\d{1,2}):(\d{2})/);
    if (match24) {
      const h = parseInt(match24[1], 10);
      const m = parseInt(match24[2], 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }
    const matchAmPm = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i);
    if (matchAmPm) {
      let h = parseInt(matchAmPm[1], 10);
      const m = matchAmPm[2] ? parseInt(matchAmPm[2], 10) : 0;
      const period = matchAmPm[3].replace(/\./g, '').toLowerCase();
      if (period === 'pm' && h < 12) h += 12;
      if (period === 'am' && h === 12) h = 0;
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }
    return null;
  }

  private addMinutes(time: string, minutes: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + minutes;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  private formatDateSpanish(date: string): string {
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const d = new Date(date + 'T12:00:00');
    return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
  }

  private formatDateTime(d: Date): string {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${d.getFullYear()} ${hours}:${mins}`;
  }

  // ── DB helpers ──

  private async getSession(userPhone: string): Promise<SessionState | null> {
    const rows = await this.db.db
      .select()
      .from(classicCalendarSessions)
      .where(eq(classicCalendarSessions.userPhone, userPhone))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    let sessionData: Record<string, unknown> = {};
    if (r.data) {
      try { sessionData = JSON.parse(r.data); } catch { /* empty */ }
    }
    return {
      id: r.id,
      userPhone: r.userPhone,
      currentStep: r.step as ClassicStep,
      sessionData,
      expiresAt: r.expiresAt,
    };
  }

  private async createSession(userPhone: string, step: ClassicStep, data: Record<string, unknown>): Promise<void> {
    await this.clearSession(userPhone);
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60000);
    await this.db.db.insert(classicCalendarSessions).values({
      userPhone,
      step,
      data: JSON.stringify(data),
      expiresAt,
    });
  }

  private async updateSession(userPhone: string, step: ClassicStep, data: Record<string, unknown>): Promise<void> {
    await this.db.db
      .update(classicCalendarSessions)
      .set({ step, data: JSON.stringify(data) })
      .where(eq(classicCalendarSessions.userPhone, userPhone));
  }

  async clearSession(userPhone: string): Promise<void> {
    await this.db.db.delete(classicCalendarSessions).where(eq(classicCalendarSessions.userPhone, userPhone));
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { GoogleCalendarService } from './google-calendar.service';
import { CalendarIntentService, CalendarIntentResult } from './calendar-intent.service';
import { OpenAIService } from '../openai/openai.service';
import { calendarFlowState } from '../database/schema/calendar-flow-state.schema';
import { loadCalendarConfig } from './calendar-config.helper';
import type { CalendarConfig } from './google-calendar.service';

const MAX_ATTEMPTS = 2;
const FLOW_EXPIRY_MINUTES = 30;
const MENU_HINT = '\n\n_Escribe *cancelar* para salir del asistente de calendario._';
const EXIT_WORDS = ['cancelar', 'salir', 'volver', 'regresar', 'exit'];

type FlowStep =
  | 'expecting_date'
  | 'expecting_time'
  | 'expecting_service'
  | 'expecting_confirmation'
  | 'expecting_cancel_selection'
  | 'expecting_reschedule_event'
  | 'expecting_reschedule_date'
  | 'expecting_reschedule_time';

interface FlowState {
  id: number;
  userPhone: string;
  conversationId: number;
  currentStep: FlowStep;
  extractedDate: string | null;
  extractedTime: string | null;
  extractedService: string | null;
  eventTitle: string | null;
  cancelEventsJson: string | null;
  attempts: number;
  expiresAt: Date;
}

@Injectable()
export class CalendarFlowHandler {
  private readonly logger = new Logger(CalendarFlowHandler.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly calendar: GoogleCalendarService,
    private readonly intent: CalendarIntentService,
    private readonly openai: OpenAIService,
  ) {}

  async handleMessage(
    userPhone: string,
    userText: string,
    conversationId: number,
    contactName: string,
    systemPrompt: string,
    conversationHistory: Array<{ sender: string; message_text: string }>,
  ): Promise<string | null> {
    const existing = await this.getFlowState(userPhone);

    if (existing) {
      if (new Date() > existing.expiresAt) {
        await this.clearFlow(userPhone);
        return '⏰ Tu sesión de calendario expiró. Si deseas agendar de nuevo, solo dímelo.';
      }

      if (this.isExitCommand(userText)) {
        await this.clearFlow(userPhone);
        return '↩️ Has salido del asistente de calendario. ¿En qué más puedo ayudarte?';
      }

      return this.continueFlow(existing, userText, contactName);
    }

    const intentResult = await this.intent.detectIntent(userText, conversationHistory, systemPrompt);
    if (intentResult.intent === 'none') return null;

    if (intentResult.intent === 'transfer_to_human') {
      return `__HANDOFF__:${(intentResult.extractedData['reason'] as string) ?? 'Transferencia solicitada'}`;
    }

    return this.startFlow(intentResult, userPhone, conversationId, userText, contactName);
  }

  private isExitCommand(text: string): boolean {
    const lower = text.trim().toLowerCase();
    return EXIT_WORDS.some((w) => lower === w);
  }

  private async startFlow(
    intentResult: CalendarIntentResult,
    userPhone: string,
    conversationId: number,
    userText: string,
    contactName: string,
  ): Promise<string> {
    const config = await loadCalendarConfig(this.db);

    switch (intentResult.intent) {
      case 'schedule': {
        const datePref = (intentResult.extractedData['date_preference'] as string) ?? '';
        const timePref = (intentResult.extractedData['time_preference'] as string) ?? null;

        const resolvedDate = datePref ? this.resolveDate(datePref) : null;
        const resolvedTime = timePref ? this.resolveTime(timePref) : null;

        if (resolvedDate && resolvedTime) {
          return this.attemptDirectSchedule(userPhone, conversationId, resolvedDate, resolvedTime, contactName, config);
        }

        if (resolvedDate) {
          await this.createFlowState(userPhone, conversationId, 'expecting_time', resolvedDate, null, null);
          return `📅 Perfecto, anotado para el *${this.formatDateSpanish(resolvedDate)}*.\n\n¿A qué hora te gustaría? (Ej: 14:00 o 3pm)` + MENU_HINT;
        }

        await this.createFlowState(userPhone, conversationId, 'expecting_date', null, null, null);
        return '📅 ¡Claro! ¿Para qué fecha te gustaría agendar? (Ej: 25/03/2026, mañana, 15 de abril)' + MENU_HINT;
      }

      case 'list': {
        try {
          const events = await this.calendar.listUpcomingEvents(20);
          const filtered = this.filterEventsByPhone(events.items ?? [], userPhone);
          return this.calendar.formatEventsForWhatsApp(filtered);
        } catch {
          return '❌ No pude consultar tus eventos. Intenta de nuevo más tarde.';
        }
      }

      case 'check_availability': {
        const dateRange = (intentResult.extractedData['date_range'] as string) ?? '';
        const date = this.resolveDate(dateRange);
        if (date) {
          try {
            const available = await this.calendar.checkAvailability(date, 8, 18);
            return available
              ? `✅ El *${this.formatDateSpanish(date)}* tiene disponibilidad.`
              : `❌ El *${this.formatDateSpanish(date)}* ya tiene eventos agendados. ¿Deseas ver los horarios disponibles?`;
          } catch {
            return '❌ No pude verificar la disponibilidad. Intenta de nuevo.';
          }
        }
        return '¿Para qué fecha deseas consultar disponibilidad? (Ej: mañana, 15 de abril)';
      }

      case 'cancel': {
        try {
          const events = await this.calendar.listUpcomingEvents(20);
          const items = this.filterEventsByPhone(events.items ?? [], userPhone);
          if (items.length === 0) return 'No tienes eventos próximos para cancelar.';

          await this.createFlowState(userPhone, conversationId, 'expecting_cancel_selection', null, null, null);
          await this.updateFlowField(userPhone, 'cancelEventsJson', JSON.stringify(items));

          let msg = '¿Cuál evento deseas cancelar?\n\n';
          items.forEach((ev: import('./google-calendar.service').CalendarEvent, i: number) => {
            const start = new Date(ev.start.dateTime ?? ev.start.date ?? '');
            msg += `${i + 1}. *${ev.summary}* — ${this.formatDateTime(start)}\n`;
          });
          msg += '\nResponde con el número del evento.' + MENU_HINT;
          return msg;
        } catch {
          return '❌ No pude obtener tus eventos. Intenta de nuevo.';
        }
      }

      case 'reschedule': {
        try {
          const events = await this.calendar.listUpcomingEvents(20);
          const items = this.filterEventsByPhone(events.items ?? [], userPhone);
          if (items.length === 0) return 'No tienes eventos próximos para reagendar.';

          await this.createFlowState(userPhone, conversationId, 'expecting_reschedule_event', null, null, null);
          await this.updateFlowField(userPhone, 'cancelEventsJson', JSON.stringify(items));

          let msg = '¿Cuál evento deseas reagendar?\n\n';
          items.forEach((ev: import('./google-calendar.service').CalendarEvent, i: number) => {
            const start = new Date(ev.start.dateTime ?? ev.start.date ?? '');
            msg += `${i + 1}. *${ev.summary}* — ${this.formatDateTime(start)}\n`;
          });
          msg += '\nResponde con el número del evento.' + MENU_HINT;
          return msg;
        } catch {
          return '❌ No pude obtener tus eventos. Intenta de nuevo.';
        }
      }

      default:
        return null as unknown as string;
    }
  }

  private async continueFlow(state: FlowState, userText: string, contactName: string): Promise<string> {
    const config = await loadCalendarConfig(this.db);

    switch (state.currentStep) {
      case 'expecting_date':
        return this.handleExpectingDate(state, userText, config);
      case 'expecting_time':
        return this.handleExpectingTime(state, userText, contactName, config);
      case 'expecting_confirmation':
        return this.handleExpectingConfirmation(state, userText, contactName, config);
      case 'expecting_cancel_selection':
        return this.handleCancelSelection(state, userText);
      case 'expecting_reschedule_event':
        return this.handleRescheduleEventSelection(state, userText);
      case 'expecting_reschedule_date':
        return this.handleRescheduleDate(state, userText, config);
      case 'expecting_reschedule_time':
        return this.handleRescheduleTime(state, userText, config);
      default:
        await this.clearFlow(state.userPhone);
        return 'Hubo un error en el flujo. ¿Deseas empezar de nuevo?';
    }
  }

  private async handleExpectingDate(state: FlowState, userText: string, config: CalendarConfig): Promise<string> {
    const date = this.resolveDate(userText);
    if (!date) {
      if (state.attempts + 1 >= MAX_ATTEMPTS) {
        await this.clearFlow(state.userPhone);
        return '❌ No pude entender la fecha. El proceso ha sido cancelado. Intenta de nuevo cuando gustes.';
      }
      await this.incrementAttempts(state.userPhone);
      return 'No entendí la fecha. Por favor usa un formato como: 25/03/2026, mañana, o 15 de abril.' + MENU_HINT;
    }

    const pastCheck = this.calendar.validateDateNotPast(date);
    if (!pastCheck.valid) {
      await this.incrementAttempts(state.userPhone);
      return pastCheck.message! + MENU_HINT;
    }

    if (config.businessHours) {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayOfWeek = dayNames[new Date(date + 'T12:00:00').getDay()];
      if (!config.businessHours[dayOfWeek]) {
        await this.incrementAttempts(state.userPhone);
        return `No atendemos los ${this.dayNameSpanish(dayOfWeek)}. Por favor elige otro día.` + MENU_HINT;
      }
    }

    await this.updateFlowFields(state.userPhone, { extractedDate: date, currentStep: 'expecting_time', attempts: 0 });
    return `📅 Perfecto, anotado para el *${this.formatDateSpanish(date)}*.\n\n¿A qué hora te gustaría? (Ej: 14:00, 3pm)` + MENU_HINT;
  }

  private async handleExpectingTime(state: FlowState, userText: string, contactName: string, config: CalendarConfig): Promise<string> {
    const time = this.resolveTime(userText);
    if (!time) {
      if (state.attempts + 1 >= MAX_ATTEMPTS) {
        await this.clearFlow(state.userPhone);
        return '❌ No pude entender la hora. El proceso ha sido cancelado.';
      }
      await this.incrementAttempts(state.userPhone);
      return 'No entendí la hora. Por favor usa un formato como: 14:00, 3pm, 15:30.' + MENU_HINT;
    }

    const date = state.extractedDate!;

    if (config.businessHours) {
      const bhCheck = this.calendar.validateBusinessHours(date, time, config.businessHours);
      if (!bhCheck.valid) {
        await this.incrementAttempts(state.userPhone);
        return `⚠️ ${bhCheck.reason}. Por favor elige otro horario.` + MENU_HINT;
      }
    }

    const advanceCheck = this.calendar.validateMinAdvanceHours(date, time, config.minAdvanceHours);
    if (!advanceCheck.valid) {
      await this.incrementAttempts(state.userPhone);
      return advanceCheck.message! + MENU_HINT;
    }

    const endTime = this.addMinutes(time, config.defaultDuration);
    const overlap = await this.calendar.checkEventOverlap(date, time, endTime);
    if (overlap.overlap) {
      await this.incrementAttempts(state.userPhone);
      return `⚠️ Ya hay un evento agendado en ese horario. Por favor elige otra hora.` + MENU_HINT;
    }

    await this.updateFlowFields(state.userPhone, {
      extractedTime: time,
      currentStep: 'expecting_confirmation',
      attempts: 0,
    });

    return (
      `📋 *Resumen de tu cita:*\n\n` +
      `📅 Fecha: *${this.formatDateSpanish(date)}*\n` +
      `🕐 Hora: *${time}*\n` +
      `⏱️ Duración: *${config.defaultDuration} minutos*\n\n` +
      `¿Confirmas esta cita? Responde *sí* o *no*` +
      MENU_HINT
    );
  }

  private async handleExpectingConfirmation(state: FlowState, userText: string, contactName: string, config: CalendarConfig): Promise<string> {
    const confirmation = this.classifyConfirmation(userText);

    if (confirmation === 'yes') {
      const date = state.extractedDate!;
      const time = state.extractedTime!;
      const startDt = `${date}T${time}:00`;
      const endDt = `${date}T${this.addMinutes(time, config.defaultDuration)}:00`;
      const title = `Cita - ${contactName}`;
      const description = `Creado desde WhatsApp por ${contactName} | Tel: ${state.userPhone}`;

      try {
        await this.calendar.createEvent(title, description, startDt, endDt, undefined, config);
        await this.clearFlow(state.userPhone);
        return `✅ ¡Cita agendada exitosamente!\n\n📅 ${this.formatDateSpanish(date)}\n🕐 ${time}\n\n¡Te esperamos!`;
      } catch (error: unknown) {
        this.logger.error('Failed to create event', error instanceof Error ? error.message : '');
        await this.clearFlow(state.userPhone);
        return '❌ Hubo un error al crear la cita. Por favor intenta de nuevo.';
      }
    }

    if (confirmation === 'no') {
      await this.clearFlow(state.userPhone);
      return '❌ Cita cancelada. Si deseas agendar en otro momento, solo dime.';
    }

    await this.incrementAttempts(state.userPhone);
    return 'Por favor responde *sí* para confirmar o *no* para cancelar.' + MENU_HINT;
  }

  private async handleCancelSelection(state: FlowState, userText: string): Promise<string> {
    const events = this.parseEventsJson(state.cancelEventsJson);
    const idx = parseInt(userText.trim(), 10) - 1;

    if (isNaN(idx) || idx < 0 || idx >= events.length) {
      if (state.attempts + 1 >= MAX_ATTEMPTS) {
        await this.clearFlow(state.userPhone);
        return '❌ Selección inválida. Proceso cancelado.';
      }
      await this.incrementAttempts(state.userPhone);
      return `Por favor responde con un número del 1 al ${events.length}.` + MENU_HINT;
    }

    const event = events[idx];
    try {
      await this.calendar.deleteEvent(event.id);
      await this.clearFlow(state.userPhone);
      return `✅ Evento *${event.summary}* cancelado exitosamente.`;
    } catch {
      await this.clearFlow(state.userPhone);
      return '❌ No pude cancelar el evento. Intenta de nuevo.';
    }
  }

  private async handleRescheduleEventSelection(state: FlowState, userText: string): Promise<string> {
    const events = this.parseEventsJson(state.cancelEventsJson);
    const idx = parseInt(userText.trim(), 10) - 1;

    if (isNaN(idx) || idx < 0 || idx >= events.length) {
      if (state.attempts + 1 >= MAX_ATTEMPTS) {
        await this.clearFlow(state.userPhone);
        return '❌ Selección inválida. Proceso cancelado.';
      }
      await this.incrementAttempts(state.userPhone);
      return `Por favor responde con un número del 1 al ${events.length}.` + MENU_HINT;
    }

    const event = events[idx];
    await this.updateFlowFields(state.userPhone, {
      currentStep: 'expecting_reschedule_date',
      eventTitle: event.id,
      attempts: 0,
    });
    return `📅 Reagendando *${event.summary}*\n\n¿Para qué nueva fecha? (Ej: mañana, 25/03/2026)` + MENU_HINT;
  }

  private async handleRescheduleDate(state: FlowState, userText: string, config: CalendarConfig): Promise<string> {
    const date = this.resolveDate(userText);
    if (!date) {
      if (state.attempts + 1 >= MAX_ATTEMPTS) {
        await this.clearFlow(state.userPhone);
        return '❌ No pude entender la fecha. Proceso cancelado.';
      }
      await this.incrementAttempts(state.userPhone);
      return 'No entendí la fecha. Usa un formato como: 25/03/2026 o mañana.' + MENU_HINT;
    }

    const pastCheck = this.calendar.validateDateNotPast(date);
    if (!pastCheck.valid) {
      await this.incrementAttempts(state.userPhone);
      return pastCheck.message! + MENU_HINT;
    }

    await this.updateFlowFields(state.userPhone, { extractedDate: date, currentStep: 'expecting_reschedule_time', attempts: 0 });
    return `📅 Nueva fecha: *${this.formatDateSpanish(date)}*\n\n¿A qué hora? (Ej: 14:00, 3pm)` + MENU_HINT;
  }

  private async handleRescheduleTime(state: FlowState, userText: string, config: CalendarConfig): Promise<string> {
    const time = this.resolveTime(userText);
    if (!time) {
      if (state.attempts + 1 >= MAX_ATTEMPTS) {
        await this.clearFlow(state.userPhone);
        return '❌ No pude entender la hora. Proceso cancelado.';
      }
      await this.incrementAttempts(state.userPhone);
      return 'No entendí la hora. Usa un formato como: 14:00 o 3pm.' + MENU_HINT;
    }

    const date = state.extractedDate!;
    const eventId = state.eventTitle!;
    const startDt = `${date}T${time}:00`;
    const endDt = `${date}T${this.addMinutes(time, config.defaultDuration)}:00`;

    try {
      await this.calendar.rescheduleEvent(eventId, startDt, endDt);
      await this.clearFlow(state.userPhone);
      return `✅ Evento reagendado para el *${this.formatDateSpanish(date)}* a las *${time}*.`;
    } catch {
      await this.clearFlow(state.userPhone);
      return '❌ No pude reagendar el evento. Intenta de nuevo.';
    }
  }

  private async attemptDirectSchedule(
    userPhone: string,
    conversationId: number,
    date: string,
    time: string,
    contactName: string,
    config: CalendarConfig,
  ): Promise<string> {
    const pastCheck = this.calendar.validateDateNotPast(date);
    if (!pastCheck.valid) return pastCheck.message!;

    if (config.businessHours) {
      const bhCheck = this.calendar.validateBusinessHours(date, time, config.businessHours);
      if (!bhCheck.valid) return `⚠️ ${bhCheck.reason}` + MENU_HINT;
    }

    const endTime = this.addMinutes(time, config.defaultDuration);
    const overlap = await this.calendar.checkEventOverlap(date, time, endTime);
    if (overlap.overlap) return '⚠️ Ya hay un evento en ese horario. ¿Deseas elegir otra hora?' + MENU_HINT;

    await this.createFlowState(userPhone, conversationId, 'expecting_confirmation', date, time, null);

    return (
      `📋 *Resumen de tu cita:*\n\n` +
      `📅 Fecha: *${this.formatDateSpanish(date)}*\n` +
      `🕐 Hora: *${time}*\n` +
      `⏱️ Duración: *${config.defaultDuration} minutos*\n\n` +
      `¿Confirmas esta cita? Responde *sí* o *no*` +
      MENU_HINT
    );
  }

  // ── Date/Time resolution helpers ──

  resolveDate(text: string): string | null {
    return this.calendar.validateDateFormat(text);
  }

  resolveTime(text: string): string | null {
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

    const hourOnly = t.match(/^(\d{1,2})$/);
    if (hourOnly) {
      const h = parseInt(hourOnly[1], 10);
      if (h >= 7 && h <= 23) {
        return `${String(h).padStart(2, '0')}:00`;
      }
    }

    return null;
  }

  private classifyConfirmation(text: string): 'yes' | 'no' | 'unknown' {
    const lower = text.trim().toLowerCase();
    const yesWords = ['sí', 'si', 'yes', 'confirmo', 'confirmar', 'dale', 'ok', 'claro', 'por supuesto', 'afirmativo', 'correcto'];
    const noWords = ['no', 'cancelar', 'cancela', 'nel', 'negativo', 'nop', 'nope', 'mejor no'];
    if (yesWords.some((w) => lower.includes(w))) return 'yes';
    if (noWords.some((w) => lower.includes(w))) return 'no';
    return 'unknown';
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

  private dayNameSpanish(day: string): string {
    const map: Record<string, string> = {
      monday: 'lunes', tuesday: 'martes', wednesday: 'miércoles', thursday: 'jueves',
      friday: 'viernes', saturday: 'sábados', sunday: 'domingos',
    };
    return map[day] ?? day;
  }

  private filterEventsByPhone(events: import('./google-calendar.service').CalendarEvent[], userPhone: string): import('./google-calendar.service').CalendarEvent[] {
    const normalized = userPhone.replace(/\D/g, '');
    return events.filter((e) => {
      const desc = (e.description ?? '').toLowerCase();
      return desc.includes(userPhone) || desc.includes(normalized);
    });
  }

  private parseEventsJson(json: string | null): Array<{ id: string; summary: string; start: { dateTime?: string; date?: string } }> {
    if (!json) return [];
    try { return JSON.parse(json); } catch { return []; }
  }

  // ── DB helpers ──

  private async getFlowState(userPhone: string): Promise<FlowState | null> {
    const rows = await this.db.db
      .select()
      .from(calendarFlowState)
      .where(eq(calendarFlowState.userPhone, userPhone))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      userPhone: r.userPhone,
      conversationId: r.conversationId,
      currentStep: r.currentStep as FlowStep,
      extractedDate: r.extractedDate,
      extractedTime: r.extractedTime,
      extractedService: r.extractedService,
      eventTitle: r.eventTitle,
      cancelEventsJson: r.cancelEventsJson,
      attempts: r.attempts ?? 0,
      expiresAt: r.expiresAt,
    };
  }

  private async createFlowState(
    userPhone: string,
    conversationId: number,
    step: FlowStep,
    date: string | null,
    time: string | null,
    service: string | null,
  ): Promise<void> {
    await this.clearFlow(userPhone);
    const expiresAt = new Date(Date.now() + FLOW_EXPIRY_MINUTES * 60000);
    await this.db.db.insert(calendarFlowState).values({
      userPhone,
      conversationId,
      currentStep: step,
      extractedDate: date,
      extractedTime: time,
      extractedService: service,
      attempts: 0,
      expiresAt,
    });
  }

  async clearFlow(userPhone: string): Promise<void> {
    await this.db.db.delete(calendarFlowState).where(eq(calendarFlowState.userPhone, userPhone));
  }

  private async incrementAttempts(userPhone: string): Promise<void> {
    const rows = await this.db.db
      .select({ attempts: calendarFlowState.attempts })
      .from(calendarFlowState)
      .where(eq(calendarFlowState.userPhone, userPhone))
      .limit(1);
    const current = rows[0]?.attempts ?? 0;
    await this.db.db
      .update(calendarFlowState)
      .set({ attempts: current + 1 })
      .where(eq(calendarFlowState.userPhone, userPhone));
  }

  private async updateFlowField(userPhone: string, field: string, value: string): Promise<void> {
    await this.db.db
      .update(calendarFlowState)
      .set({ [field]: value })
      .where(eq(calendarFlowState.userPhone, userPhone));
  }

  private async updateFlowFields(userPhone: string, fields: Record<string, unknown>): Promise<void> {
    await this.db.db
      .update(calendarFlowState)
      .set(fields)
      .where(eq(calendarFlowState.userPhone, userPhone));
  }
}

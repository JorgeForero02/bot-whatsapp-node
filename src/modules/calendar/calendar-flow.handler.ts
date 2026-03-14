import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { GoogleCalendarService } from './google-calendar.service';
import { CalendarIntentService, CalendarIntentResult } from './calendar-intent.service';
import { OpenAIService } from '../openai/openai.service';
import { calendarFlowState } from '../database/schema/calendar-flow-state.schema';
import { loadCalendarConfig } from './calendar-config.helper';
import { resolveTime as sharedResolveTime, addMinutes, formatDateSpanish, formatDateTime, dayNameSpanish, filterEventsByPhone } from './calendar-date.helper';
import type { CalendarConfig } from './google-calendar.service';

const MAX_ATTEMPTS = 5;
const FLOW_EXPIRY_MINUTES = 30;
const MENU_HINT = '\n\n_Escribe *cancelar* si deseas salir del proceso._';
const EXIT_WORD = 'cancelar';

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

    if (!this.hasCalendarKeywords(userText)) {
      return null;
    }

    const intentResult = await this.intent.detectIntent(userText, conversationHistory, systemPrompt);
    if (intentResult.intent === 'none') return null;

    if (intentResult.intent === 'transfer_to_human') {
      return `__HANDOFF__:${(intentResult.extractedData['reason'] as string) ?? 'Transferencia solicitada'}`;
    }

    return this.startFlow(intentResult, userPhone, conversationId, userText, contactName);
  }

  private hasCalendarKeywords(text: string): boolean {
    const keywords = [
      'cita', 'agendar', 'agenda', 'reservar', 'reserva', 'turno',
      'calendario', 'disponibilidad', 'horario', 'hora', 'fecha',
      'cancelar', 'reagendar', 'mover', 'cambiar',
      'appointment', 'schedule', 'book', 'calendar', 'available',
    ];
    const lowerText = text.toLowerCase();
    return keywords.some(keyword => lowerText.includes(keyword));
  }

  private isExitCommand(text: string): boolean {
    return text.trim().toLowerCase() === EXIT_WORD;
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
          return `📅 Perfecto, anotado para el *${formatDateSpanish(resolvedDate)}*.\n\n¿A qué hora te vendría bien? Puedes decirme algo como "a las 2 de la tarde" o "14:00".` + MENU_HINT;
        }

        await this.createFlowState(userPhone, conversationId, 'expecting_date', null, null, null);
        return '📅 ¡Claro! ¿Para qué fecha te gustaría agendar? Puedes decirme "mañana", "el próximo viernes" o una fecha específica.' + MENU_HINT;
      }

      case 'list': {
        try {
          const events = await this.calendar.listUpcomingEvents(20);
          const filtered = filterEventsByPhone(events.items ?? [], userPhone);
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
            const freeSlots = await this.calendar.getFreeSlots(date, config);
            if (freeSlots.length > 0) {
              let msg = `✅ El *${formatDateSpanish(date)}* tiene los siguientes horarios disponibles:\n\n`;
              freeSlots.forEach((slot, i) => {
                msg += `${i + 1}. *${slot}*\n`;
              });
              msg += '\n¿Deseas agendar una cita? Solo dime la hora.';
              return msg;
            }
            return `❌ El *${formatDateSpanish(date)}* no tiene horarios disponibles. ¿Deseas consultar otro día?`;
          } catch {
            return '❌ No pude verificar la disponibilidad. Intenta de nuevo.';
          }
        }
        return '¿Para qué fecha deseas consultar disponibilidad? (Ej: mañana, 15 de abril)';
      }

      case 'cancel': {
        try {
          const events = await this.calendar.listUpcomingEvents(20);
          const items = filterEventsByPhone(events.items ?? [], userPhone);
          if (items.length === 0) return 'No tienes eventos próximos para cancelar.';

          await this.createFlowState(userPhone, conversationId, 'expecting_cancel_selection', null, null, null);
          await this.updateFlowField(userPhone, 'cancelEventsJson', JSON.stringify(items));

          let msg = '¿Cuál evento deseas cancelar?\n\n';
          items.forEach((ev: import('./google-calendar.service').CalendarEvent, i: number) => {
            const start = new Date(ev.start.dateTime ?? ev.start.date ?? '');
            msg += `${i + 1}. *${ev.summary}* — ${formatDateTime(start)}\n`;
          });
          msg += '\nDime el número del evento que quieres cancelar.' + MENU_HINT;
          return msg;
        } catch {
          return '❌ No pude obtener tus eventos. Intenta de nuevo.';
        }
      }

      case 'reschedule': {
        try {
          const events = await this.calendar.listUpcomingEvents(20);
          const items = filterEventsByPhone(events.items ?? [], userPhone);
          if (items.length === 0) return 'No tienes eventos próximos para reagendar.';

          await this.createFlowState(userPhone, conversationId, 'expecting_reschedule_event', null, null, null);
          await this.updateFlowField(userPhone, 'cancelEventsJson', JSON.stringify(items));

          let msg = '¿Cuál evento deseas reagendar?\n\n';
          items.forEach((ev: import('./google-calendar.service').CalendarEvent, i: number) => {
            const start = new Date(ev.start.dateTime ?? ev.start.date ?? '');
            msg += `${i + 1}. *${ev.summary}* — ${formatDateTime(start)}\n`;
          });
          msg += '\nDime el número del evento que quieres mover.' + MENU_HINT;
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
      case 'expecting_service':
        return this.handleExpectingService(state, userText, contactName, config);
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
      return 'No pude entender esa fecha. ¿Podrías decírmela de otra forma? Por ejemplo: "mañana", "el 25 de marzo" o "próximo lunes".' + MENU_HINT;
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
        return `No atendemos los ${dayNameSpanish(dayOfWeek)}. Por favor elige otro día.` + MENU_HINT;
      }
    }

    await this.updateFlowFields(state.userPhone, { extractedDate: date, currentStep: 'expecting_time', attempts: 0 });
    return `📅 Perfecto, anotado para el *${formatDateSpanish(date)}*.\n\n¿A qué hora te vendría bien?` + MENU_HINT;
  }

  private async handleExpectingTime(state: FlowState, userText: string, contactName: string, config: CalendarConfig): Promise<string> {
    const time = this.resolveTime(userText);
    if (!time) {
      if (state.attempts + 1 >= MAX_ATTEMPTS) {
        await this.clearFlow(state.userPhone);
        return '❌ No pude entender la hora. El proceso ha sido cancelado.';
      }
      await this.incrementAttempts(state.userPhone);
      return 'No pude entender esa hora. ¿Podrías decírmela de otra forma? Por ejemplo: "a las 3 de la tarde" o "14:00".' + MENU_HINT;
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

    const endTime = addMinutes(time, config.defaultDuration);
    const overlap = await this.calendar.checkEventOverlap(date, time, endTime);
    if (overlap.overlap) {
      await this.incrementAttempts(state.userPhone);
      return `⚠️ Ya hay un evento agendado en ese horario. Por favor elige otra hora.` + MENU_HINT;
    }

    await this.updateFlowFields(state.userPhone, {
      extractedTime: time,
      currentStep: 'expecting_service',
      attempts: 0,
    });

    return `✅ Horario *${time}* anotado.\n\n¿Para qué servicio o motivo es la cita?` + MENU_HINT;
  }

  private async handleExpectingService(state: FlowState, userText: string, contactName: string, config: CalendarConfig): Promise<string> {
    const service = userText.trim();
    if (!service || service.length < 2) {
      if (state.attempts + 1 >= MAX_ATTEMPTS) {
        await this.clearFlow(state.userPhone);
        return '❌ No se recibió el motivo de la cita. El proceso ha sido cancelado.';
      }
      await this.incrementAttempts(state.userPhone);
      return 'Por favor cuéntame para qué servicio o motivo necesitas la cita.' + MENU_HINT;
    }

    const date = state.extractedDate!;
    const time = state.extractedTime!;

    await this.updateFlowFields(state.userPhone, {
      extractedService: service,
      currentStep: 'expecting_confirmation',
      attempts: 0,
    });

    return (
      `📋 *Resumen de tu cita:*\n\n` +
      `📅 Fecha: *${formatDateSpanish(date)}*\n` +
      `🕐 Hora: *${time}*\n` +
      `💼 Servicio: *${service}*\n` +
      `⏱️ Duración: *${config.defaultDuration} minutos*\n\n` +
      `¿Te parece bien esta cita? Dime si la confirmo o si prefieres cambiar algo.` +
      MENU_HINT
    );
  }

  private async handleExpectingConfirmation(state: FlowState, userText: string, contactName: string, config: CalendarConfig): Promise<string> {
    const confirmation = this.classifyConfirmation(userText);

    if (confirmation === 'yes') {
      const date = state.extractedDate!;
      const time = state.extractedTime!;
      const startDt = `${date}T${time}:00`;
      const endDt = `${date}T${addMinutes(time, config.defaultDuration)}:00`;
      const title = state.extractedService
        ? `${state.extractedService} - ${contactName}`
        : `Cita - ${contactName}`;
      const description = state.extractedService
        ? `Servicio: ${state.extractedService} | Creado desde WhatsApp por ${contactName} | Tel: ${state.userPhone}`
        : `Creado desde WhatsApp por ${contactName} | Tel: ${state.userPhone}`;

      try {
        await this.calendar.createEvent(title, description, startDt, endDt, undefined, config);
        await this.clearFlow(state.userPhone);
        return `✅ ¡Cita agendada exitosamente!\n\n📅 ${formatDateSpanish(date)}\n🕐 ${time}\n\n¡Te esperamos!`;
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

    const lower = userText.toLowerCase();
    
    if (lower.includes('duración') || lower.includes('duracion') || lower.includes('tiempo')) {
      return `⚠️ La duración de la cita es fija: *${config.defaultDuration} minutos*.\n\n¿Deseas cambiar la fecha, hora o servicio? O dime si confirmo la cita así.`;
    }
    
    if (lower.includes('fecha') || lower.includes('día') || lower.includes('dia')) {
      await this.updateFlowFields(state.userPhone, { currentStep: 'expecting_date', attempts: 0 });
      return '📅 ¿Para qué nueva fecha te gustaría agendar? Puedes decirme "mañana", "el próximo viernes" o una fecha específica.' + MENU_HINT;
    }
    
    if (lower.includes('hora') || lower.includes('horario')) {
      await this.updateFlowFields(state.userPhone, { currentStep: 'expecting_time', attempts: 0 });
      return '🕐 ¿A qué nueva hora te vendría bien?' + MENU_HINT;
    }
    
    if (lower.includes('servicio') || lower.includes('motivo') || lower.includes('razón') || lower.includes('razon')) {
      await this.updateFlowFields(state.userPhone, { currentStep: 'expecting_service', attempts: 0 });
      return '💼 ¿Para qué servicio o motivo es la cita?' + MENU_HINT;
    }

    await this.incrementAttempts(state.userPhone);
    return 'Dime si confirmo la cita o si prefieres cambiar algo.\n\nPuedes cambiar: *fecha*, *hora* o *servicio*.\n_(La duración es fija: ' + config.defaultDuration + ' minutos)_' + MENU_HINT;
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
      return `Por favor dime solo el número del evento (del 1 al ${events.length}) que deseas cancelar.` + MENU_HINT;
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
      return `Por favor dime solo el número del evento (del 1 al ${events.length}) que deseas reagendar.` + MENU_HINT;
    }

    const event = events[idx];
    await this.updateFlowFields(state.userPhone, {
      currentStep: 'expecting_reschedule_date',
      eventTitle: event.id,
      attempts: 0,
    });
    return `📅 Reagendando *${event.summary}*\n\n¿Para qué nueva fecha te gustaría moverla?` + MENU_HINT;
  }

  private async handleRescheduleDate(state: FlowState, userText: string, config: CalendarConfig): Promise<string> {
    const date = this.resolveDate(userText);
    if (!date) {
      if (state.attempts + 1 >= MAX_ATTEMPTS) {
        await this.clearFlow(state.userPhone);
        return '❌ No pude entender la fecha. Proceso cancelado.';
      }
      await this.incrementAttempts(state.userPhone);
      return 'No pude entender esa fecha. ¿Podrías decírmela de otra forma?' + MENU_HINT;
    }

    const pastCheck = this.calendar.validateDateNotPast(date);
    if (!pastCheck.valid) {
      await this.incrementAttempts(state.userPhone);
      return pastCheck.message! + MENU_HINT;
    }

    await this.updateFlowFields(state.userPhone, { extractedDate: date, currentStep: 'expecting_reschedule_time', attempts: 0 });
    return `📅 Nueva fecha: *${formatDateSpanish(date)}*\n\n¿A qué hora te vendría bien?` + MENU_HINT;
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
    const endDt = `${date}T${addMinutes(time, config.defaultDuration)}:00`;

    try {
      await this.calendar.rescheduleEvent(eventId, startDt, endDt);
      await this.clearFlow(state.userPhone);
      return `✅ Evento reagendado para el *${formatDateSpanish(date)}* a las *${time}*.`;
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

    const endTime = addMinutes(time, config.defaultDuration);
    const overlap = await this.calendar.checkEventOverlap(date, time, endTime);
    if (overlap.overlap) return '⚠️ Ya hay un evento en ese horario. ¿Deseas elegir otra hora?' + MENU_HINT;

    await this.createFlowState(userPhone, conversationId, 'expecting_service', date, time, null);

    return `✅ Fecha *${formatDateSpanish(date)}* y hora *${time}* anotadas.\n\n¿Cuál es el motivo o servicio de tu cita? (Ej: consulta médica, corte de cabello, revisión)` + MENU_HINT;
  }

  resolveDate(text: string): string | null {
    return this.calendar.validateDateFormat(text);
  }

  resolveTime(text: string): string | null {
    const result = sharedResolveTime(text);
    if (result) return result;

    const hourOnly = text.trim().match(/^(\d{1,2})$/);
    if (hourOnly) {
      const hour = parseInt(hourOnly[1], 10);
      if (hour >= 7 && hour <= 23) {
        return `${String(hour).padStart(2, '0')}:00`;
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


  private parseEventsJson(json: string | null): Array<{ id: string; summary: string; start: { dateTime?: string; date?: string } }> {
    if (!json) return [];
    try { return JSON.parse(json); } catch { return []; }
  }

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

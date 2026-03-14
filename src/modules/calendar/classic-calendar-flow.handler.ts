import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { GoogleCalendarService } from './google-calendar.service';
import { classicCalendarSessions } from '../database/schema/classic-calendar-sessions.schema';
import { loadCalendarConfig } from './calendar-config.helper';
import { resolveTime as sharedResolveTime, addMinutes, formatDateSpanish, formatDateTime, dayNameSpanish, filterEventsByPhone } from './calendar-date.helper';
import type { CalendarConfig } from './google-calendar.service';

const SESSION_EXPIRY_MINUTES = 30;
const MENU_HINT = '\n\n_Escribe *menú* para volver al menú principal._';
const MENU_WORDS = ['menú', 'menu', 'salir', 'volver', 'regresar'];

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
      const now = new Date();
      
      if (now > session.expiresAt) {
        this.logger.warn(`Calendar session expired for ${userPhone}: now=${now.toISOString()} > expiresAt=${session.expiresAt.toISOString()}`);
        await this.clearSession(userPhone);
        return '⏰ Tu sesión de calendario expiró. Escribe *menú* para volver al menú principal.';
      }

      if (this.isMenuCommand(userText)) {
        await this.clearSession(userPhone);
        return '↩️ Has salido del calendario. Escribe *menú* para ver las opciones del bot.';
      }

      return this.continueSession(session, userText, contactName);
    }

    return null;
  }

  private isMenuCommand(text: string): boolean {
    const lower = text.trim().toLowerCase();
    return MENU_WORDS.some((w) => lower === w);
  }

  async startCalendarMenu(userPhone: string): Promise<string> {
    await this.createSession(userPhone, 'main_menu', {});
    return (
      '📅 *Menú de Calendario*\n\n' +
      '1️⃣ Agendar cita\n' +
      '2️⃣ Ver mis eventos\n' +
      '3️⃣ Cancelar evento\n' +
      '4️⃣ Reagendar evento\n\n' +
      'Responde con el número de la opción.' +
      MENU_HINT
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
        return 'Sesión inválida. Escribe *menú* para volver al menú principal.';
    }
  }

  private async handleMainMenu(session: SessionState, userText: string, contactName: string, config: CalendarConfig): Promise<string> {
    const choice = userText.trim();

    switch (choice) {
      case '1': {
        const dateOpts = this.buildDateOptions(config);
        if (dateOpts.length === 0) {
          await this.clearSession(session.userPhone);
          return '⚠️ No hay fechas disponibles en los próximos días. Contáctanos directamente.' + MENU_HINT;
        }
        const dateOptDates = dateOpts.map((o) => o.date);
        await this.updateSession(session.userPhone, 'schedule_date', { dateOptions: dateOptDates });
        let dateMsg = '📅 ¿Para qué fecha deseas agendar?\n\n';
        dateOpts.forEach((opt, i) => {
          dateMsg += `${i + 1}. ${opt.label}\n`;
        });
        dateMsg += '\nEscribe el *número* de la opción o la fecha en formato *dd/mm* o *dd/mm/aaaa*\n(Ej: 16/3 o 16/03/2026)' + MENU_HINT;
        return dateMsg;
      }
      case '2': {
        try {
          const events = await this.calendar.listUpcomingEvents(20);
          const filtered = filterEventsByPhone(events.items ?? [], session.userPhone);
          await this.clearSession(session.userPhone);
          const formatted = this.calendar.formatEventsForWhatsApp(filtered);
          return formatted + '\n\n_Escribe *menú* para volver al menú principal._';
        } catch {
          await this.clearSession(session.userPhone);
          return '❌ No pude consultar tus eventos. Intenta de nuevo.\n\n_Escribe *menú* para volver al menú principal._';
        }
      }
      case '3': {
        try {
          const events = await this.calendar.listUpcomingEvents(20);
          const items = filterEventsByPhone(events.items ?? [], session.userPhone);
          if (items.length === 0) {
            await this.clearSession(session.userPhone);
            return 'No tienes eventos próximos para cancelar.\n\n_Escribe *menú* para volver al menú principal._';
          }
          await this.updateSession(session.userPhone, 'cancel_select', { events: items });
          let msg = '¿Cuál evento deseas cancelar?\n\n';
          items.forEach((ev: import('./google-calendar.service').CalendarEvent, i: number) => {
            const start = new Date(ev.start.dateTime ?? ev.start.date ?? '');
            msg += `${i + 1}. *${ev.summary}* — ${formatDateTime(start)}\n`;
          });
          msg += '\nResponde con el número del evento.' + MENU_HINT;
          return msg;
        } catch {
          await this.clearSession(session.userPhone);
          return '❌ No pude obtener tus eventos.' + MENU_HINT;
        }
      }
      case '4': {
        try {
          const events = await this.calendar.listUpcomingEvents(20);
          const items = filterEventsByPhone(events.items ?? [], session.userPhone);
          if (items.length === 0) {
            await this.clearSession(session.userPhone);
            return 'No tienes eventos próximos para reagendar.\n\n_Escribe *menú* para volver al menú principal._';
          }
          await this.updateSession(session.userPhone, 'reschedule_select', { events: items });
          let msg = '¿Cuál evento deseas reagendar?\n\n';
          items.forEach((ev: import('./google-calendar.service').CalendarEvent, i: number) => {
            const start = new Date(ev.start.dateTime ?? ev.start.date ?? '');
            msg += `${i + 1}. *${ev.summary}* — ${formatDateTime(start)}\n`;
          });
          msg += '\nResponde con el número del evento.' + MENU_HINT;
          return msg;
        } catch {
          await this.clearSession(session.userPhone);
          return '❌ No pude obtener tus eventos.' + MENU_HINT;
        }
      }
      default:
        return 'Por favor responde con *1*, *2*, *3* o *4*.' + MENU_HINT;
    }
  }

  private async handleScheduleDate(session: SessionState, userText: string, config: CalendarConfig): Promise<string> {
    const input = userText.trim();
    let date: string | null = null;
    const numInput = parseInt(input, 10);
    const dateOptions = (session.sessionData['dateOptions'] as string[] | undefined) ?? [];
    if (!isNaN(numInput) && numInput >= 1 && numInput <= dateOptions.length) {
      date = dateOptions[numInput - 1];
    } else {
      date = this.parseStrictDate(input);
    }
    if (!date) {
      return '❌ Opción inválida.\n\nEscribe el *número* de la opción o la fecha en formato *dd/mm* o *dd/mm/aaaa*\n(Ej: 16/3, 16/03 o 16/03/2026)' + MENU_HINT;
    }

    const pastCheck = this.calendar.validateDateNotPast(date);
    if (!pastCheck.valid) return pastCheck.message! + MENU_HINT;

    if (config.businessHours) {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayOfWeek = dayNames[new Date(date + 'T12:00:00').getDay()];
      if (!config.businessHours[dayOfWeek]) {
        return `⚠️ No atendemos los ${dayNameSpanish(dayOfWeek)}. Por favor elige otro día.\n\nEscribe la fecha en formato *dd/mm* o *dd/mm/aaaa*` + MENU_HINT;
      }
    }

    const timeOpts = this.buildTimeOptions(config, date);
    await this.updateSession(session.userPhone, 'schedule_time', { ...session.sessionData, date, timeOptions: timeOpts });
    if (timeOpts.length > 0) {
      let timeMsg = `📅 Fecha: *${formatDateSpanish(date)}*\n\n🕐 ¿A qué hora?\n\n`;
      timeOpts.forEach((t, i) => {
        timeMsg += `${i + 1}. *${t}*\n`;
      });
      timeMsg += '\nEscribe el *número* de la opción o la hora en formato *HH:MM*' + MENU_HINT;
      return timeMsg;
    }
    return `📅 Fecha: *${formatDateSpanish(date)}*\n\n🕐 ¿A qué hora? (Ej: 14:00, 3pm)` + MENU_HINT;
  }

  private async handleScheduleTime(session: SessionState, userText: string, contactName: string, config: CalendarConfig): Promise<string> {
    const input = userText.trim();
    let time: string | null = null;
    const numInput = parseInt(input, 10);
    const timeOptions = (session.sessionData['timeOptions'] as string[] | undefined) ?? [];
    if (!isNaN(numInput) && numInput >= 1 && numInput <= timeOptions.length) {
      time = timeOptions[numInput - 1];
    } else {
      time = sharedResolveTime(input);
    }
    if (!time) {
      return '❌ Opción inválida.\n\nEscribe el *número* de la opción o la hora en formato *HH:MM*\n(Ej: 14:00, 3pm, 10:30am)' + MENU_HINT;
    }

    const date = session.sessionData['date'] as string;

    if (config.businessHours) {
      const bhCheck = this.calendar.validateBusinessHours(date, time, config.businessHours);
      if (!bhCheck.valid) return `⚠️ ${bhCheck.reason}.\n\nPor favor elige otro horario.` + MENU_HINT;
    }

    const advanceCheck = this.calendar.validateMinAdvanceHours(date, time, config.minAdvanceHours);
    if (!advanceCheck.valid) return advanceCheck.message! + MENU_HINT;

    const endTime = addMinutes(time, config.defaultDuration);
    const overlap = await this.calendar.checkEventOverlap(date, time, endTime);
    if (overlap.overlap) return '⚠️ Ya hay un evento agendado en ese horario.\n\nPor favor elige otra hora.' + MENU_HINT;

    await this.updateSession(session.userPhone, 'schedule_confirm', { ...session.sessionData, time });

    return (
      `📋 *Resumen de tu cita:*\n\n` +
      `📅 Fecha: *${formatDateSpanish(date)}*\n` +
      `🕐 Hora: *${time}*\n` +
      `⏱️ Duración: *${config.defaultDuration} minutos*\n\n` +
      `¿Confirmas esta cita? Responde *sí* o *no*` +
      MENU_HINT
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
      const endDt = `${date}T${addMinutes(time, config.defaultDuration)}:00`;

      try {
        await this.calendar.createEvent(
          `Cita - ${contactName}`,
          `Creado desde WhatsApp por ${contactName} | Tel: ${session.userPhone}`,
          startDt,
          endDt,
          undefined,
          config,
        );
        await this.clearSession(session.userPhone);
        return `✅ *¡Cita agendada exitosamente!*\n\n📅 ${formatDateSpanish(date)}\n🕐 ${time}\n\n¡Te esperamos!\n\n_Escribe *menú* para volver al menú principal._`;
      } catch {
        await this.clearSession(session.userPhone);
        return '❌ Error al crear la cita. Intenta de nuevo.\n\n_Escribe *menú* para volver al menú principal._';
      }
    }

    if (noWords.some((w) => lower.includes(w))) {
      await this.clearSession(session.userPhone);
      return '❌ Cita cancelada.\n\n_Escribe *menú* para volver al menú principal._';
    }

    return 'Responde *sí* o *no*.' + MENU_HINT;
  }

  private async handleCancelSelect(session: SessionState, userText: string): Promise<string> {
    const events = (session.sessionData['events'] ?? []) as Array<{ id: string; summary: string }>;
    const idx = parseInt(userText.trim(), 10) - 1;

    if (isNaN(idx) || idx < 0 || idx >= events.length) {
      return '❌ Selección inválida. Responde con el *número* del evento.' + MENU_HINT;
    }

    try {
      await this.calendar.deleteEvent(events[idx].id);
      await this.clearSession(session.userPhone);
      return `✅ Evento *${events[idx].summary}* cancelado exitosamente.\n\n_Escribe *menú* para volver al menú principal._`;
    } catch {
      await this.clearSession(session.userPhone);
      return '❌ No pude cancelar el evento.\n\n_Escribe *menú* para volver al menú principal._';
    }
  }

  private async handleRescheduleSelect(session: SessionState, userText: string): Promise<string> {
    const events = (session.sessionData['events'] ?? []) as Array<{ id: string; summary: string }>;
    const idx = parseInt(userText.trim(), 10) - 1;

    if (isNaN(idx) || idx < 0 || idx >= events.length) {
      return '❌ Selección inválida. Responde con el *número* del evento.' + MENU_HINT;
    }

    await this.updateSession(session.userPhone, 'reschedule_date', {
      ...session.sessionData,
      eventId: events[idx].id,
      eventSummary: events[idx].summary,
    });
    return `📅 Reagendando *${events[idx].summary}*\n\n¿Para qué nueva fecha?\nEscribe en formato *dd/mm* o *dd/mm/aaaa*` + MENU_HINT;
  }

  private async handleRescheduleDate(session: SessionState, userText: string, config: CalendarConfig): Promise<string> {
    const date = this.parseStrictDate(userText.trim());
    if (!date) {
      return '❌ Formato de fecha inválido.\n\nEscribe la fecha en formato *dd/mm* o *dd/mm/aaaa*\n(Ej: 16/3, 16/03 o 16/03/2026)' + MENU_HINT;
    }

    const pastCheck = this.calendar.validateDateNotPast(date);
    if (!pastCheck.valid) return pastCheck.message! + MENU_HINT;

    await this.updateSession(session.userPhone, 'reschedule_time', { ...session.sessionData, newDate: date });
    return `📅 Nueva fecha: *${formatDateSpanish(date)}*\n\n¿A qué hora? (Ej: 14:00, 3pm)` + MENU_HINT;
  }

  private async handleRescheduleTime(session: SessionState, userText: string, config: CalendarConfig): Promise<string> {
    const time = sharedResolveTime(userText);
    if (!time) {
      return '❌ Formato de hora inválido.\n\nEscribe la hora en formato *HH:MM* o *HHam/pm*\n(Ej: 14:00, 3pm)' + MENU_HINT;
    }

    const date = session.sessionData['newDate'] as string;
    const eventId = session.sessionData['eventId'] as string;
    const startDt = `${date}T${time}:00`;
    const endDt = `${date}T${addMinutes(time, config.defaultDuration)}:00`;

    if (config.businessHours) {
      const bhCheck = this.calendar.validateBusinessHours(date, time, config.businessHours);
      if (!bhCheck.valid) return `⚠️ ${bhCheck.reason}.\n\nPor favor elige otro horario.` + MENU_HINT;
    }

    try {
      await this.calendar.rescheduleEvent(eventId, startDt, endDt);
      await this.clearSession(session.userPhone);
      return `✅ Evento reagendado exitosamente.\n\n📅 ${formatDateSpanish(date)}\n🕐 ${time}\n\n_Escribe *menú* para volver al menú principal._`;
    } catch {
      await this.clearSession(session.userPhone);
      return '❌ No pude reagendar el evento.\n\n_Escribe *menú* para volver al menú principal._';
    }
  }

  private buildDateOptions(config: CalendarConfig): { label: string; date: string }[] {
    const dayNamesEs = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const dayNamesShort = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const monthNamesShort = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const dayBusKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    const options: { label: string; date: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let offset = 0; offset < 14 && options.length < 7; offset++) {
      const d = new Date(today);
      d.setDate(today.getDate() + offset);
      const dayKey = dayBusKeys[d.getDay()];
      if (config.businessHours && !config.businessHours[dayKey]) continue;

      const dateStr = d.toISOString().slice(0, 10);
      const dayShort = dayNamesShort[d.getDay()];
      const monthShort = monthNamesShort[d.getMonth()];
      const dayNum = d.getDate();
      const dayNameFull = dayNamesEs[d.getDay()];
      const dayNameCap = dayNameFull.charAt(0).toUpperCase() + dayNameFull.slice(1);

      let label: string;
      if (offset === 0) {
        label = `Hoy (${dayShort} ${dayNum} ${monthShort})`;
      } else if (offset === 1) {
        label = `Mañana (${dayShort} ${dayNum} ${monthShort})`;
      } else {
        label = `${dayNameCap} (${dayNum} ${monthShort})`;
      }

      options.push({ label, date: dateStr });
    }

    return options;
  }

  private buildTimeOptions(config: CalendarConfig, date: string): string[] {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayOfWeek = dayNames[new Date(date + 'T12:00:00').getDay()];
    const hours = config.businessHours[dayOfWeek];
    if (!hours) return [];

    const [startH, startM] = hours.start.split(':').map(Number);
    const [endH, endM] = hours.end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const slotDuration = config.defaultDuration;
    const minAdvanceTime = new Date(Date.now() + config.minAdvanceHours * 3600000);

    const slots: string[] = [];
    for (let currentMin = startMinutes; currentMin + slotDuration <= endMinutes; currentMin += slotDuration) {
      const slotHour = Math.floor(currentMin / 60);
      const slotMin = currentMin % 60;
      const timeStr = `${String(slotHour).padStart(2, '0')}:${String(slotMin).padStart(2, '0')}`;
      const slotDateTime = new Date(`${date}T${timeStr}:00`);
      if (slotDateTime < minAdvanceTime) continue;
      slots.push(timeStr);
    }

    return slots;
  }

  private parseStrictDate(text: string): string | null {
    const fullMatch = text.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
    if (fullMatch) {
      const day = parseInt(fullMatch[1], 10);
      const month = parseInt(fullMatch[2], 10);
      const year = parseInt(fullMatch[3], 10);
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      const d = new Date(year, month - 1, day);
      if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    
    const shortMatch = text.match(/^(\d{1,2})[/\-](\d{1,2})$/);
    if (shortMatch) {
      const day = parseInt(shortMatch[1], 10);
      const month = parseInt(shortMatch[2], 10);
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      
      const now = new Date();
      let year = now.getFullYear();
      const d = new Date(year, month - 1, day);
      if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
      
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (d < today) {
        year += 1;
      }
      
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    
    return null;
  }


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
      try { sessionData = JSON.parse(r.data); } catch { }
    }
    const expiresAtDate = new Date(r.expiresAt + 'Z');
    return {
      id: r.id,
      userPhone: r.userPhone,
      currentStep: r.step as ClassicStep,
      sessionData,
      expiresAt: expiresAtDate,
    };
  }

  private async createSession(userPhone: string, step: ClassicStep, data: Record<string, unknown>): Promise<void> {
    await this.clearSession(userPhone);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_MINUTES * 60000);
    const expiresAtStr = expiresAt.toISOString().slice(0, 19).replace('T', ' ');
    await this.db.db.insert(classicCalendarSessions).values({
      userPhone,
      step,
      data: JSON.stringify(data),
      expiresAt: expiresAtStr,
    });
  }

  private async updateSession(userPhone: string, step: ClassicStep, data: Record<string, unknown>): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_MINUTES * 60000);
    const expiresAtStr = expiresAt.toISOString().slice(0, 19).replace('T', ' ');
    await this.db.db
      .update(classicCalendarSessions)
      .set({ step, data: JSON.stringify(data), expiresAt: expiresAtStr })
      .where(eq(classicCalendarSessions.userPhone, userPhone));
  }

  async clearSession(userPhone: string): Promise<void> {
    await this.db.db.delete(classicCalendarSessions).where(eq(classicCalendarSessions.userPhone, userPhone));
  }
}

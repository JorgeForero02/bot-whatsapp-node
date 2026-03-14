import type { CalendarEvent } from './google-calendar.service';

const SPANISH_MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const ENGLISH_TO_SPANISH_DAYS: Record<string, string> = {
  monday: 'lunes',
  tuesday: 'martes',
  wednesday: 'miércoles',
  thursday: 'jueves',
  friday: 'viernes',
  saturday: 'sábados',
  sunday: 'domingos',
};

export function resolveTime(text: string): string | null {
  const trimmed = text.trim().toLowerCase();

  const match24 = trimmed.match(/(\d{1,2}):(\d{2})/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  const matchAmPm = trimmed.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i);
  if (matchAmPm) {
    let hours = parseInt(matchAmPm[1], 10);
    const minutes = matchAmPm[2] ? parseInt(matchAmPm[2], 10) : 0;
    const period = matchAmPm[3].replace(/\./g, '').toLowerCase();
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  return null;
}

export function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + mins + minutes;
  return `${String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

export function formatDateSpanish(date: string): string {
  const parsed = new Date(date + 'T12:00:00');
  return `${parsed.getDate()} de ${SPANISH_MONTHS[parsed.getMonth()]} de ${parsed.getFullYear()}`;
}

export function formatDateTime(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()} ${hours}:${mins}`;
}

export function dayNameSpanish(day: string): string {
  return ENGLISH_TO_SPANISH_DAYS[day] ?? day;
}

export function filterEventsByPhone(events: CalendarEvent[], userPhone: string): CalendarEvent[] {
  const normalizedPhone = userPhone.replace(/\D/g, '');
  return events.filter((event) => {
    const description = (event.description ?? '').toLowerCase();
    return description.includes(userPhone) || description.includes(normalizedPhone);
  });
}

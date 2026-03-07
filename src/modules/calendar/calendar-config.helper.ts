import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { calendarSettings } from '../database/schema/calendar-settings.schema';
import type { CalendarConfig } from './google-calendar.service';

const DEFAULTS: CalendarConfig = {
  timezone: 'America/Bogota',
  defaultDuration: 60,
  maxEventsPerDay: 8,
  minAdvanceHours: 1,
  reminders: {
    email: { enabled: true, minutes_before: 1440 },
    popup: { enabled: true, minutes_before: 30 },
  },
  businessHours: {
    monday: { start: '08:00', end: '18:00' },
    tuesday: { start: '08:00', end: '18:00' },
    wednesday: { start: '08:00', end: '18:00' },
    thursday: { start: '08:00', end: '18:00' },
    friday: { start: '08:00', end: '18:00' },
    saturday: null,
    sunday: null,
  },
};

export async function loadCalendarConfig(db: DatabaseService): Promise<CalendarConfig> {
  const config = { ...DEFAULTS };

  try {
    const rows = await db.db.select().from(calendarSettings);
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.settingKey, row.settingValue);
    }

    if (map.has('timezone')) config.timezone = map.get('timezone')!;
    if (map.has('default_duration')) config.defaultDuration = parseInt(map.get('default_duration')!, 10) || 60;
    if (map.has('max_events_per_day')) config.maxEventsPerDay = parseInt(map.get('max_events_per_day')!, 10) || 8;
    if (map.has('min_advance_hours')) config.minAdvanceHours = parseInt(map.get('min_advance_hours')!, 10) || 1;

    if (map.has('reminders')) {
      try {
        config.reminders = JSON.parse(map.get('reminders')!);
      } catch { /* keep defaults */ }
    }

    if (map.has('business_hours')) {
      try {
        config.businessHours = JSON.parse(map.get('business_hours')!);
      } catch { /* keep defaults */ }
    }
  } catch {
    // Table might not exist yet, use defaults
  }

  return config;
}

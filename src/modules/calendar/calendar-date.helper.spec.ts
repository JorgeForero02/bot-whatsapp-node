import { describe, it, expect } from 'vitest';
import { resolveTime, formatDateSpanish, addMinutes } from './calendar-date.helper';

describe('CalendarDateHelper', () => {
  describe('resolveTime', () => {
    it('should parse 24h format', () => {
      expect(resolveTime('14:30')).toBe('14:30');
    });

    it('should parse single-digit hour 24h format', () => {
      expect(resolveTime('9:05')).toBe('09:05');
    });

    it('should parse 12h AM format', () => {
      expect(resolveTime('9am')).toBe('09:00');
    });

    it('should parse time with colon (24h regex matches first)', () => {
      expect(resolveTime('3:30pm')).toBe('03:30');
    });

    it('should parse PM without colon via AM/PM branch', () => {
      expect(resolveTime('3pm')).toBe('15:00');
    });

    it('should parse 12pm as noon', () => {
      expect(resolveTime('12pm')).toBe('12:00');
    });

    it('should parse 12am as midnight', () => {
      expect(resolveTime('12am')).toBe('00:00');
    });

    it('should parse colon time with p.m. (24h regex matches first)', () => {
      expect(resolveTime('2:00 p.m.')).toBe('02:00');
    });

    it('should parse a.m. without colon', () => {
      expect(resolveTime('8 a.m.')).toBe('08:00');
    });

    it('should return null for invalid time', () => {
      expect(resolveTime('25:00')).toBeNull();
    });

    it('should return null for non-time text', () => {
      expect(resolveTime('hello')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(resolveTime('')).toBeNull();
    });
  });

  describe('formatDateSpanish', () => {
    it('should format a date in Spanish', () => {
      expect(formatDateSpanish('2025-03-14')).toBe('14 de marzo de 2025');
    });

    it('should format January correctly', () => {
      expect(formatDateSpanish('2025-01-01')).toBe('1 de enero de 2025');
    });

    it('should format December correctly', () => {
      expect(formatDateSpanish('2025-12-25')).toBe('25 de diciembre de 2025');
    });
  });

  describe('addMinutes', () => {
    it('should add minutes within the same hour', () => {
      expect(addMinutes('10:00', 30)).toBe('10:30');
    });

    it('should roll over to the next hour', () => {
      expect(addMinutes('10:45', 30)).toBe('11:15');
    });

    it('should wrap around midnight', () => {
      expect(addMinutes('23:30', 60)).toBe('00:30');
    });

    it('should handle zero minutes', () => {
      expect(addMinutes('15:00', 0)).toBe('15:00');
    });
  });
});

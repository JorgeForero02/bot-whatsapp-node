import { Injectable } from '@nestjs/common';

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
  jueves: 4, viernes: 5, sábado: 6, sabado: 6,
};

@Injectable()
export class DateParserService {
  parse(dateText: string): string | null {
    return (
      this.parseNumericDate(dateText) ??
      this.parseSpanishMonthDate(dateText) ??
      this.parseRelativeDate(dateText) ??
      this.parseDayName(dateText)
    );
  }

  parseNumericDate(dateText: string): string | null {
    const match = dateText.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
    if (!match) return null;
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    if (!this.isValidDate(year, month, day)) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  parseSpanishMonthDate(dateText: string): string | null {
    for (const [name, num] of Object.entries(MONTHS)) {
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
    return null;
  }

  parseRelativeDate(dateText: string): string | null {
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

  parseDayName(dateText: string): string | null {
    const lower = dateText.toLowerCase();
    const now = new Date();
    for (const [dayName, targetDay] of Object.entries(WEEKDAYS)) {
      if (lower.includes(dayName)) {
        const today = now.getDay();
        let daysToAdd = targetDay - today;
        if (daysToAdd <= 0) {
          daysToAdd += 7;
        }
        const d = new Date(now);
        d.setDate(d.getDate() + daysToAdd);
        return d.toISOString().slice(0, 10);
      }
    }
    return null;
  }

  isValidDate(year: number, month: number, day: number): boolean {
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
  }
}

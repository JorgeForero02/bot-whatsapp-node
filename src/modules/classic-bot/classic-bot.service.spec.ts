import { describe, it, expect } from 'vitest';
import { ClassicBotService } from './classic-bot.service';

function createService(): ClassicBotService {
  const mockDb = {} as any;
  const mockSettings = {} as any;
  return new ClassicBotService(mockDb, mockSettings);
}

describe('ClassicBotService', () => {
  const service = createService();

  describe('matchKeywords', () => {
    const matchKeywords = (service as any).matchKeywords.bind(service);

    it('should match when text contains a keyword (case-insensitive)', () => {
      expect(matchKeywords('Quiero ver el MENU', ['menu', 'inicio'])).toBe(true);
    });

    it('should match exact keyword', () => {
      expect(matchKeywords('inicio', ['inicio'])).toBe(true);
    });

    it('should return false when no keyword matches', () => {
      expect(matchKeywords('algo diferente', ['menu', 'inicio'])).toBe(false);
    });

    it('should return false for null keywords', () => {
      expect(matchKeywords('test', null)).toBe(false);
    });

    it('should return false for undefined keywords', () => {
      expect(matchKeywords('test', undefined)).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(matchKeywords('test', [])).toBe(false);
    });

    it('should parse JSON string keywords', () => {
      expect(matchKeywords('hola mundo', '["hola", "saludo"]')).toBe(true);
    });

    it('should return false for invalid JSON string', () => {
      expect(matchKeywords('test', 'not-json')).toBe(false);
    });

    it('should match partial text', () => {
      expect(matchKeywords('quiero agendar una cita', ['agendar', 'cita'])).toBe(true);
    });
  });
});

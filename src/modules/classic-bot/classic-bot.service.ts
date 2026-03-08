import { Injectable, Logger } from '@nestjs/common';
import { eq, and, asc } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { flowNodes } from '../database/schema/flow-nodes.schema';
import { flowOptions } from '../database/schema/flow-options.schema';
import { classicFlowSessions } from '../database/schema/classic-flow-sessions.schema';
import { settings } from '../database/schema/settings.schema';

const SESSION_EXPIRY_MINUTES = 30;
const MAX_ATTEMPTS = 3;

export interface ClassicBotResult {
  type: 'response' | 'calendar' | 'fallback' | 'farewell';
  response: string;
  calendarIntent?: string;
}

interface FlowNode {
  id: number;
  name: string;
  triggerKeywords: string[];
  messageText: string;
  nextNodeId: number | null;
  isRoot: boolean | null;
  requiresCalendar: boolean | null;
  matchAnyInput: boolean | null;
  isFarewell: boolean | null;
  positionOrder: number | null;
  isActive: boolean | null;
}

interface FlowOption {
  id: number;
  nodeId: number;
  optionText: string;
  optionKeywords: string[];
  nextNodeId: number | null;
  positionOrder: number | null;
}

interface Session {
  id: number;
  userPhone: string;
  currentNodeId: number | null;
  attempts: number;
  expiresAt: Date;
}

@Injectable()
export class ClassicBotService {
  private readonly logger = new Logger(ClassicBotService.name);

  constructor(private readonly db: DatabaseService) {}

  async processMessage(userPhone: string, messageText: string): Promise<ClassicBotResult> {
    const fallback = await this.getFallbackMessage();
    const session = await this.getSession(userPhone);

    if (session) {
      if (new Date() > session.expiresAt) {
        await this.clearSession(userPhone);
      } else {
        return this.handleSessionMessage(session, userPhone, messageText, fallback);
      }
    }

    return this.handleNewMessage(userPhone, messageText, fallback);
  }

  private async handleNewMessage(userPhone: string, messageText: string, fallback: string): Promise<ClassicBotResult> {
    const rootNodes = await this.db.db
      .select()
      .from(flowNodes)
      .where(and(eq(flowNodes.isRoot, true), eq(flowNodes.isActive, true)))
      .orderBy(asc(flowNodes.positionOrder));

    for (const node of rootNodes) {
      if (this.matchKeywords(messageText, node.triggerKeywords as string[])) {
        return this.resolveNextNode(node.id, userPhone, fallback);
      }
    }

    const matchAnyNodes = rootNodes.filter((n) => n.matchAnyInput);
    if (matchAnyNodes.length > 0) {
      if (matchAnyNodes.length > 1) {
        this.logger.warn(`ClassicBot: multiple match_any_input nodes found (${matchAnyNodes.length}), using first`);
      }
      this.logger.log(`ClassicBot: match_any_input triggered, node_id=${matchAnyNodes[0].id}`);
      return this.resolveNextNode(matchAnyNodes[0].id, userPhone, fallback);
    }

    return { type: 'fallback', response: fallback };
  }

  private async handleSessionMessage(session: Session, userPhone: string, messageText: string, fallback: string): Promise<ClassicBotResult> {
    if (!session.currentNodeId) {
      await this.clearSession(userPhone);
      return this.handleNewMessage(userPhone, messageText, fallback);
    }

    const currentNode = await this.getNode(session.currentNodeId);

    if (!currentNode) {
      await this.clearSession(userPhone);
      return { type: 'fallback', response: fallback };
    }

    const matchedOption = await this.matchOptionsFromDb(currentNode.id, messageText);

    if (matchedOption) {
      return this.resolveNextNode(matchedOption.nextNodeId, userPhone, fallback);
    }

    if (this.matchKeywords(messageText, currentNode.triggerKeywords as string[])) {
      return this.resolveNextNode(currentNode.nextNodeId, userPhone, fallback);
    }

    const newAttempts = (session.attempts ?? 0) + 1;
    this.logger.log(`ClassicBot: no keyword match, phone=${userPhone}, node=${currentNode.id}, attempts=${newAttempts}`);

    if (newAttempts >= MAX_ATTEMPTS) {
      await this.clearSession(userPhone);
      return { type: 'fallback', response: fallback };
    }

    await this.updateAttempts(userPhone, newAttempts);
    return { type: 'fallback', response: fallback };
  }

  private async resolveNextNode(nodeId: number | null, userPhone: string, fallback: string): Promise<ClassicBotResult> {
    if (!nodeId) {
      await this.clearSession(userPhone);
      return { type: 'fallback', response: fallback };
    }

    const node = await this.getNode(nodeId);
    if (!node) {
      await this.clearSession(userPhone);
      return { type: 'fallback', response: fallback };
    }

    if (node.requiresCalendar) {
      await this.clearSession(userPhone);
      return {
        type: 'calendar',
        response: node.messageText,
        calendarIntent: this.detectCalendarIntent(node),
      };
    }

    if (node.isFarewell) {
      await this.clearSession(userPhone);
      return { type: 'farewell', response: node.messageText };
    }

    await this.createOrUpdateSession(userPhone, nodeId);
    return { type: 'response', response: node.messageText };
  }

  private matchKeywords(text: string, keywords: string[] | string | null | undefined): boolean {
    let kws: string[];
    if (!keywords) return false;
    if (typeof keywords === 'string') {
      try { kws = JSON.parse(keywords); } catch { return false; }
    } else {
      kws = keywords;
    }
    if (!Array.isArray(kws) || kws.length === 0) return false;
    const lower = text.toLowerCase().trim();
    return kws.some((kw) => lower.includes(String(kw).toLowerCase()));
  }

  private matchOptions(text: string, options: FlowOption[]): FlowOption | null {
    const lower = text.toLowerCase().trim();

    const numMatch = lower.match(/^(\d+)$/);
    if (numMatch) {
      const idx = parseInt(numMatch[1], 10) - 1;
      if (idx >= 0 && idx < options.length) return options[idx];
    }

    for (const opt of options) {
      if (this.matchKeywords(text, opt.optionKeywords)) return opt;
    }

    for (const opt of options) {
      if (lower.includes(opt.optionText.toLowerCase())) return opt;
    }

    return null;
  }

  private detectCalendarIntent(node: FlowNode): string {
    const name = (node.name ?? '').toLowerCase();
    const parsedKws = typeof node.triggerKeywords === 'string'
      ? (() => { try { return JSON.parse(node.triggerKeywords as string); } catch { return []; } })()
      : (node.triggerKeywords ?? []);
    const keywords = JSON.stringify(parsedKws).toLowerCase();

    const cancelPatterns = ['cancel', 'anular', 'borrar', 'eliminar'];
    const reschedulePatterns = ['reagendar', 'reprogramar', 'cambiar cita', 'mover cita', 'cambiar fecha'];
    const listPatterns = ['ver cita', 'mis cita', 'proxima', 'próxima', 'listar', 'consultar cita', 'agendado', 'que tengo'];

    for (const p of cancelPatterns) {
      if (name.includes(p) || keywords.includes(p)) return 'cancel';
    }
    for (const p of reschedulePatterns) {
      if (name.includes(p) || keywords.includes(p)) return 'reschedule';
    }
    for (const p of listPatterns) {
      if (name.includes(p) || keywords.includes(p)) return 'list';
    }

    return 'schedule';
  }

  private async matchOptionsFromDb(nodeId: number, messageText: string): Promise<FlowOption | null> {
    const options = await this.db.db
      .select()
      .from(flowOptions)
      .where(eq(flowOptions.nodeId, nodeId))
      .orderBy(asc(flowOptions.positionOrder));

    if (options.length === 0) return null;

    for (const opt of options as FlowOption[]) {
      if (this.matchKeywords(messageText, opt.optionKeywords)) {
        return opt;
      }
    }
    return null;
  }

  private async getNode(nodeId: number): Promise<FlowNode | null> {
    const rows = await this.db.db
      .select()
      .from(flowNodes)
      .where(and(eq(flowNodes.id, nodeId), eq(flowNodes.isActive, true)))
      .limit(1);
    return rows.length > 0 ? (rows[0] as FlowNode) : null;
  }

  private async getSession(userPhone: string): Promise<Session | null> {
    const rows = await this.db.db
      .select()
      .from(classicFlowSessions)
      .where(eq(classicFlowSessions.userPhone, userPhone))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      userPhone: r.userPhone,
      currentNodeId: r.currentNodeId,
      attempts: r.attempts ?? 0,
      expiresAt: r.expiresAt,
    };
  }

  private async createOrUpdateSession(userPhone: string, nodeId: number): Promise<void> {
    const existing = await this.getSession(userPhone);
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60000);

    if (existing) {
      await this.db.db
        .update(classicFlowSessions)
        .set({ currentNodeId: nodeId, attempts: 0, expiresAt })
        .where(eq(classicFlowSessions.userPhone, userPhone));
    } else {
      await this.db.db.insert(classicFlowSessions).values({
        userPhone,
        currentNodeId: nodeId,
        attempts: 0,
        expiresAt,
      });
    }
  }

  private async updateAttempts(userPhone: string, attempts: number): Promise<void> {
    await this.db.db
      .update(classicFlowSessions)
      .set({ attempts })
      .where(eq(classicFlowSessions.userPhone, userPhone));
  }

  private async getFallbackMessage(): Promise<string> {
    try {
      const result = await this.db.db
        .select()
        .from(settings)
        .where(eq(settings.settingKey, 'bot_fallback_message'))
        .limit(1);
      if (result.length > 0 && result[0].settingValue) {
        return result[0].settingValue;
      }
    } catch { /* fall through to default */ }
    return 'Lo siento, no entendí tu mensaje. Por favor intenta de nuevo o escribe "inicio" para comenzar.';
  }

  async clearSession(userPhone: string): Promise<void> {
    await this.db.db
      .delete(classicFlowSessions)
      .where(eq(classicFlowSessions.userPhone, userPhone));
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { eq, and, asc } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { flowNodes } from '../database/schema/flow-nodes.schema';
import { flowOptions } from '../database/schema/flow-options.schema';
import { classicFlowSessions } from '../database/schema/classic-flow-sessions.schema';

const SESSION_EXPIRY_MINUTES = 30;
const MAX_ATTEMPTS = 3;

export interface ClassicBotResult {
  type: 'response' | 'calendar' | 'fallback';
  response: string;
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
    const session = await this.getSession(userPhone);

    if (session) {
      if (new Date() > session.expiresAt) {
        await this.clearSession(userPhone);
        return this.handleNewMessage(userPhone, messageText);
      }

      if (session.attempts >= MAX_ATTEMPTS) {
        await this.clearSession(userPhone);
        return {
          type: 'fallback',
          response: 'No pude entender tu solicitud. Un agente te atenderá pronto. ¿Puedo ayudarte en algo más?',
        };
      }

      return this.handleSessionMessage(session, userPhone, messageText);
    }

    return this.handleNewMessage(userPhone, messageText);
  }

  private async handleNewMessage(userPhone: string, messageText: string): Promise<ClassicBotResult> {
    if (this.detectCalendarIntent(messageText)) {
      return { type: 'calendar', response: '' };
    }

    const rootNodes = await this.db.db
      .select()
      .from(flowNodes)
      .where(and(eq(flowNodes.isRoot, true), eq(flowNodes.isActive, true)))
      .orderBy(asc(flowNodes.positionOrder));

    for (const node of rootNodes) {
      if (this.matchKeywords(messageText, node.triggerKeywords as string[])) {
        return this.processNode(node as FlowNode, userPhone);
      }
    }

    return {
      type: 'fallback',
      response: '',
    };
  }

  private async handleSessionMessage(session: Session, userPhone: string, messageText: string): Promise<ClassicBotResult> {
    if (!session.currentNodeId) {
      await this.clearSession(userPhone);
      return this.handleNewMessage(userPhone, messageText);
    }

    const nodeRows = await this.db.db
      .select()
      .from(flowNodes)
      .where(eq(flowNodes.id, session.currentNodeId))
      .limit(1);

    if (nodeRows.length === 0) {
      await this.clearSession(userPhone);
      return { type: 'fallback', response: '' };
    }

    const currentNode = nodeRows[0] as FlowNode;

    if (currentNode.matchAnyInput && currentNode.nextNodeId) {
      const nextNode = await this.getNode(currentNode.nextNodeId);
      if (nextNode) {
        return this.processNode(nextNode, userPhone);
      }
    }

    const options = await this.db.db
      .select()
      .from(flowOptions)
      .where(eq(flowOptions.nodeId, currentNode.id))
      .orderBy(asc(flowOptions.positionOrder));

    const matchedOption = this.matchOptions(messageText, options as FlowOption[]);

    if (matchedOption) {
      if (matchedOption.nextNodeId) {
        const nextNode = await this.getNode(matchedOption.nextNodeId);
        if (nextNode) {
          return this.processNode(nextNode, userPhone);
        }
      }
      await this.clearSession(userPhone);
      return { type: 'response', response: 'Gracias por tu respuesta.' };
    }

    if (this.detectCalendarIntent(messageText)) {
      await this.clearSession(userPhone);
      return { type: 'calendar', response: '' };
    }

    await this.incrementAttempts(userPhone);
    const optionsList = (options as FlowOption[])
      .map((o) => `• ${o.optionText}`)
      .join('\n');

    return {
      type: 'response',
      response: `No entendí tu respuesta. Las opciones disponibles son:\n\n${optionsList}\n\nPor favor elige una opción.`,
    };
  }

  private async processNode(node: FlowNode, userPhone: string): Promise<ClassicBotResult> {
    if (node.requiresCalendar) {
      await this.clearSession(userPhone);
      return { type: 'calendar', response: node.messageText };
    }

    if (node.isFarewell) {
      await this.clearSession(userPhone);
      return { type: 'response', response: node.messageText };
    }

    const options = await this.db.db
      .select()
      .from(flowOptions)
      .where(eq(flowOptions.nodeId, node.id))
      .orderBy(asc(flowOptions.positionOrder));

    if (options.length > 0 || node.nextNodeId) {
      await this.createOrUpdateSession(userPhone, node.id);

      let response = node.messageText;
      if (options.length > 0) {
        response += '\n\n';
        (options as FlowOption[]).forEach((opt, i) => {
          response += `${i + 1}. ${opt.optionText}\n`;
        });
      }

      return { type: 'response', response };
    }

    await this.clearSession(userPhone);
    return { type: 'response', response: node.messageText };
  }

  private matchKeywords(text: string, keywords: string[]): boolean {
    if (!keywords || keywords.length === 0) return false;
    const lower = text.toLowerCase().trim();
    return keywords.some((kw) => lower.includes(kw.toLowerCase()));
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

  private detectCalendarIntent(text: string): boolean {
    const calendarKeywords = [
      'agendar', 'programar', 'reservar', 'apartar', 'agenda', 'agendo',
      'programa', 'programo', 'cita para', 'quiero agendar',
      'eventos', 'agendado', 'calendario', 'próximos eventos',
      'qué tengo', 'mis eventos', 'disponible', 'disponibilidad',
      'tienes tiempo', 'estás libre',
    ];
    const lower = text.toLowerCase();
    return calendarKeywords.some((kw) => lower.includes(kw));
  }

  private async getNode(nodeId: number): Promise<FlowNode | null> {
    const rows = await this.db.db
      .select()
      .from(flowNodes)
      .where(eq(flowNodes.id, nodeId))
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

  private async incrementAttempts(userPhone: string): Promise<void> {
    const session = await this.getSession(userPhone);
    if (!session) return;
    await this.db.db
      .update(classicFlowSessions)
      .set({ attempts: (session.attempts ?? 0) + 1 })
      .where(eq(classicFlowSessions.userPhone, userPhone));
  }

  async clearSession(userPhone: string): Promise<void> {
    await this.db.db
      .delete(classicFlowSessions)
      .where(eq(classicFlowSessions.userPhone, userPhone));
  }
}

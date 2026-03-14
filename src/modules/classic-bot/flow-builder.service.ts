import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { eq, asc } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { flowNodes } from '../database/schema/flow-nodes.schema';
import { flowOptions } from '../database/schema/flow-options.schema';

interface FlowNodeData {
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
  options: FlowOptionData[];
}

interface FlowOptionData {
  id: number;
  nodeId: number;
  optionText: string;
  optionKeywords: string[];
  nextNodeId: number | null;
  positionOrder: number | null;
}

interface SaveNodeInput {
  name: string;
  triggerKeywords: string[];
  messageText: string;
  nextNodeId?: number | null;
  isRoot?: boolean;
  requiresCalendar?: boolean;
  matchAnyInput?: boolean;
  isFarewell?: boolean;
  positionOrder?: number;
  isActive?: boolean;
  options?: Array<{
    optionText: string;
    optionKeywords: string[];
    nextNodeId?: number | null;
    positionOrder?: number;
  }>;
}

interface FlowExport {
  version: string;
  exportedAt: string;
  nodes: Array<SaveNodeInput & { id?: number }>;
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') {
    try { return JSON.parse(value) as string[]; } catch { return []; }
  }
  return [];
}

@Injectable()
export class FlowBuilderService {
  private readonly logger = new Logger(FlowBuilderService.name);

  constructor(private readonly db: DatabaseService) {}

  async getFlowTree(): Promise<FlowNodeData[]> {
    const nodes = await this.db.db
      .select()
      .from(flowNodes)
      .orderBy(asc(flowNodes.positionOrder));

    const result: FlowNodeData[] = [];

    for (const node of nodes) {
      const opts = await this.db.db
        .select()
        .from(flowOptions)
        .where(eq(flowOptions.nodeId, node.id))
        .orderBy(asc(flowOptions.positionOrder));

      result.push({
        ...node,
        triggerKeywords: parseJsonArray(node.triggerKeywords),
        options: opts.map((o) => ({
          ...o,
          optionKeywords: parseJsonArray(o.optionKeywords),
        })),
      });
    }

    return result;
  }

  async saveNode(id: number | null, input: SaveNodeInput): Promise<number> {
    if (id) {
      await this.db.db
        .update(flowNodes)
        .set({
          name: input.name,
          triggerKeywords: input.triggerKeywords,
          messageText: input.messageText,
          nextNodeId: input.nextNodeId ?? null,
          isRoot: input.isRoot ?? false,
          requiresCalendar: input.requiresCalendar ?? false,
          matchAnyInput: input.matchAnyInput ?? false,
          isFarewell: input.isFarewell ?? false,
          positionOrder: input.positionOrder ?? 0,
          isActive: input.isActive ?? true,
        })
        .where(eq(flowNodes.id, id));

      if (input.options) {
        await this.db.db.delete(flowOptions).where(eq(flowOptions.nodeId, id));
        for (const opt of input.options) {
          await this.db.db.insert(flowOptions).values({
            nodeId: id,
            optionText: opt.optionText,
            optionKeywords: opt.optionKeywords,
            nextNodeId: opt.nextNodeId ?? null,
            positionOrder: opt.positionOrder ?? 0,
          });
        }
      }

      return id;
    }

    const result = await this.db.db.insert(flowNodes).values({
      name: input.name,
      triggerKeywords: input.triggerKeywords,
      messageText: input.messageText,
      nextNodeId: input.nextNodeId ?? null,
      isRoot: input.isRoot ?? false,
      requiresCalendar: input.requiresCalendar ?? false,
      matchAnyInput: input.matchAnyInput ?? false,
      isFarewell: input.isFarewell ?? false,
      positionOrder: input.positionOrder ?? 0,
      isActive: input.isActive ?? true,
    });

    const newId = Number(result[0].insertId);

    if (input.options) {
      for (const opt of input.options) {
        await this.db.db.insert(flowOptions).values({
          nodeId: newId,
          optionText: opt.optionText,
          optionKeywords: opt.optionKeywords,
          nextNodeId: opt.nextNodeId ?? null,
          positionOrder: opt.positionOrder ?? 0,
        });
      }
    }

    return newId;
  }

  async deleteNode(id: number): Promise<void> {
    const existing = await this.db.db
      .select()
      .from(flowNodes)
      .where(eq(flowNodes.id, id))
      .limit(1);

    if (existing.length === 0) throw new NotFoundException('Node not found');

    await this.db.db.delete(flowOptions).where(eq(flowOptions.nodeId, id));
    await this.db.db.delete(flowNodes).where(eq(flowNodes.id, id));
  }

  async detectCycle(startNodeId: number): Promise<boolean> {
    const visited = new Set<number>();
    const stack = [startNodeId];

    while (stack.length > 0) {
      const nodeId = stack.pop()!;
      if (visited.has(nodeId)) return true;
      visited.add(nodeId);

      const node = await this.db.db
        .select()
        .from(flowNodes)
        .where(eq(flowNodes.id, nodeId))
        .limit(1);

      if (node.length === 0) continue;

      if (node[0].nextNodeId) {
        stack.push(node[0].nextNodeId);
      }

      const opts = await this.db.db
        .select()
        .from(flowOptions)
        .where(eq(flowOptions.nodeId, nodeId));

      for (const opt of opts) {
        if (opt.nextNodeId) stack.push(opt.nextNodeId);
      }
    }

    return false;
  }

  async exportToJson(): Promise<FlowExport> {
    const tree = await this.getFlowTree();
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      nodes: tree.map((node) => ({
        name: node.name,
        triggerKeywords: node.triggerKeywords,
        messageText: node.messageText,
        nextNodeId: node.nextNodeId,
        isRoot: node.isRoot ?? false,
        requiresCalendar: node.requiresCalendar ?? false,
        matchAnyInput: node.matchAnyInput ?? false,
        isFarewell: node.isFarewell ?? false,
        positionOrder: node.positionOrder ?? 0,
        isActive: node.isActive ?? true,
        options: node.options.map((o) => ({
          optionText: o.optionText,
          optionKeywords: o.optionKeywords,
          nextNodeId: o.nextNodeId,
          positionOrder: o.positionOrder ?? 0,
        })),
      })),
    };
  }

  async importFromJson(data: FlowExport): Promise<{ imported: number }> {
    if (!data.nodes || !Array.isArray(data.nodes)) {
      throw new BadRequestException('Invalid import data: missing nodes array');
    }

    let imported = 0;
    const idMap = new Map<number, number>();

    for (const nodeData of data.nodes) {
      const legacyNode = nodeData as unknown as Record<string, unknown>;
      const triggerKeywords = (nodeData.triggerKeywords ?? legacyNode['trigger_keywords'] ?? []) as string[];
      const messageText = (nodeData.messageText ?? legacyNode['message_text']) as string;
      const nextNodeId = (nodeData.nextNodeId ?? legacyNode['next_node_id'] ?? null) as number | null;
      const isRoot = (nodeData.isRoot ?? legacyNode['is_root'] ?? false) as boolean;
      const requiresCalendar = (nodeData.requiresCalendar ?? legacyNode['requires_calendar'] ?? false) as boolean;
      const matchAnyInput = (nodeData.matchAnyInput ?? legacyNode['match_any_input'] ?? false) as boolean;
      const isFarewell = (nodeData.isFarewell ?? legacyNode['is_farewell'] ?? false) as boolean;
      const positionOrder = (nodeData.positionOrder ?? legacyNode['position_order'] ?? 0) as number;
      const isActive = (nodeData.isActive ?? legacyNode['is_active'] ?? true) as boolean;

      const oldId = nodeData.id;
      const newId = await this.saveNode(null, {
        name: nodeData.name,
        triggerKeywords,
        messageText,
        nextNodeId,
        isRoot,
        requiresCalendar,
        matchAnyInput,
        isFarewell,
        positionOrder,
        isActive,
      });

      if (oldId !== undefined) {
        idMap.set(oldId, newId);
      }
      imported++;
    }

    for (const nodeData of data.nodes) {
      if (nodeData.id === undefined) continue;
      const newId = idMap.get(nodeData.id);
      if (!newId) continue;

      if (nodeData.nextNodeId && idMap.has(nodeData.nextNodeId)) {
        await this.db.db
          .update(flowNodes)
          .set({ nextNodeId: idMap.get(nodeData.nextNodeId)! })
          .where(eq(flowNodes.id, newId));
      }

      if (nodeData.options) {
        for (const opt of nodeData.options) {
          const legacyOpt = opt as Record<string, unknown>;
          const optionKeywords = (opt.optionKeywords ?? legacyOpt['option_keywords'] ?? []) as string[];
          const nextId = (opt.nextNodeId ?? legacyOpt['next_node_id'] ?? null) as number | null;
          const mappedNextId = nextId ? idMap.get(nextId) ?? nextId : null;
          await this.db.db.insert(flowOptions).values({
            nodeId: newId,
            optionText: opt.optionText,
            optionKeywords,
            nextNodeId: mappedNextId,
            positionOrder: (opt.positionOrder ?? legacyOpt['position_order'] ?? 0) as number,
          });
        }
      }
    }

    this.logger.log(`Imported ${imported} flow nodes`);
    return { imported };
  }
}

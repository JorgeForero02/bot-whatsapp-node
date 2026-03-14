import { Controller, Get, Post, Delete, Body, Param, Logger, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiAuthGuard } from '../../common/guards/api-auth.guard';
import { FlowBuilderService } from '../classic-bot/flow-builder.service';
import { ClassicBotService } from '../classic-bot/classic-bot.service';

@UseGuards(ApiAuthGuard)
@Controller('api')
export class ApiFlowController {
  private readonly logger = new Logger(ApiFlowController.name);

  constructor(
    private readonly flowBuilder: FlowBuilderService,
    private readonly classicBot: ClassicBotService,
  ) {}

  @Get('flows')
  async getFlows(): Promise<Record<string, unknown>> {
    const tree = await this.flowBuilder.getFlowTree();
    return { success: true, data: tree };
  }

  @Post('flows')
  @HttpCode(HttpStatus.OK)
  async saveFlow(
    @Body() body: { id?: number | null; name: string; triggerKeywords: string[]; messageText: string; nextNodeId?: number | null; isRoot?: boolean; requiresCalendar?: boolean; matchAnyInput?: boolean; isFarewell?: boolean; positionOrder?: number; isActive?: boolean; options?: Array<{ optionText: string; optionKeywords: string[]; nextNodeId?: number | null; positionOrder?: number }> },
  ): Promise<Record<string, unknown>> {
    const nodeId = await this.flowBuilder.saveNode(body.id ?? null, body);
    return { success: true, data: { id: nodeId } };
  }

  @Delete('flows/:id')
  async deleteFlow(@Param('id') id: string): Promise<Record<string, unknown>> {
    await this.flowBuilder.deleteNode(parseInt(id, 10));
    return { success: true };
  }

  @Get('flows/export')
  async exportFlows(): Promise<Record<string, unknown>> {
    const data = await this.flowBuilder.exportToJson();
    return { success: true, data };
  }

  @Post('flows/import')
  @HttpCode(HttpStatus.OK)
  async importFlows(@Body() body: { version: string; exportedAt: string; nodes: Array<Record<string, unknown>> }): Promise<Record<string, unknown>> {
    const result = await this.flowBuilder.importFromJson(body as unknown as Parameters<FlowBuilderService['importFromJson']>[0]);
    return { success: true, data: result };
  }

  @Post('simulate-flow')
  @HttpCode(HttpStatus.OK)
  async simulateFlow(@Body() body: { message: string; reset?: boolean }): Promise<Record<string, unknown>> {
    if (body.reset) {
      await this.classicBot.clearSession('simulator');
      return { success: true, data: { type: 'reset', response: 'Simulador reiniciado' } };
    }
    const result = await this.classicBot.processMessage('simulator', body.message);
    return { success: true, data: result };
  }
}

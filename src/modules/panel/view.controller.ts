import { Controller, Get, Res, Logger } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { OnboardingService } from '../onboarding/onboarding.service';
import { DatabaseService } from '../database/database.service';
import { eq } from 'drizzle-orm';
import { settings } from '../database/schema/settings.schema';

@Controller()
export class ViewController {
  private readonly logger = new Logger(ViewController.name);

  constructor(
    private readonly onboarding: OnboardingService,
    private readonly db: DatabaseService,
  ) {}

  private async getLayoutData(activePage: string): Promise<Record<string, unknown>> {
    let onboarding: { completed: number; total: number; percent: number } | null = null;
    let showFlowBuilder = false;

    try {
      const progress = await this.onboarding.getProgress();
      onboarding = {
        completed: progress.completedCount,
        total: progress.totalCount,
        percent: Math.round((progress.completedCount / progress.totalCount) * 100),
      };
    } catch { /* table might not exist */ }

    try {
      const modeRow = await this.db.db
        .select()
        .from(settings)
        .where(eq(settings.settingKey, 'bot_mode'))
        .limit(1);
      showFlowBuilder = modeRow.length > 0 && modeRow[0].settingValue === 'classic';
    } catch { /* ignore */ }

    return {
      onboarding,
      showFlowBuilder,
      [`is${activePage}`]: true,
    };
  }

  private async render(reply: FastifyReply, template: string, data: Record<string, unknown>): Promise<void> {
    await (reply as FastifyReply & { view: (template: string, data: Record<string, unknown>) => Promise<string> }).view(
      template,
      data,
    );
  }

  @Get()
  async dashboard(@Res() reply: FastifyReply): Promise<void> {
    const data = await this.getLayoutData('Dashboard');
    const complete = await this.onboarding.isOnboardingComplete().catch(() => false);
    await this.render(reply, 'dashboard', {
      ...data,
      title: 'Dashboard',
      isDashboard: true,
      onboardingBanner: true,
      onboardingComplete: complete,
    });
  }

  @Get('conversations')
  async conversations(@Res() reply: FastifyReply): Promise<void> {
    const data = await this.getLayoutData('Conversations');
    await this.render(reply, 'conversations', { ...data, title: 'Conversaciones', isConversations: true });
  }

  @Get('documents')
  async documents(@Res() reply: FastifyReply): Promise<void> {
    const data = await this.getLayoutData('Documents');
    await this.render(reply, 'documents', { ...data, title: 'Documentos', isDocuments: true });
  }

  @Get('settings')
  async settingsPage(@Res() reply: FastifyReply): Promise<void> {
    const data = await this.getLayoutData('Settings');
    await this.render(reply, 'settings', { ...data, title: 'Configuración', isSettings: true });
  }

  @Get('calendar-settings')
  async calendarSettings(@Res() reply: FastifyReply): Promise<void> {
    const data = await this.getLayoutData('CalendarSettings');
    await this.render(reply, 'calendar-settings', { ...data, title: 'Calendario', isCalendarSettings: true });
  }

  @Get('credentials')
  async credentials(@Res() reply: FastifyReply): Promise<void> {
    const data = await this.getLayoutData('Credentials');
    await this.render(reply, 'credentials', { ...data, title: 'Credenciales', isCredentials: true });
  }

  @Get('onboarding')
  async onboardingPage(@Res() reply: FastifyReply): Promise<void> {
    const data = await this.getLayoutData('Onboarding');
    await this.render(reply, 'onboarding', { ...data, title: 'Configuración Inicial' });
  }

  @Get('flow-builder')
  async flowBuilder(@Res() reply: FastifyReply): Promise<void> {
    const data = await this.getLayoutData('FlowBuilder');
    await this.render(reply, 'flow-builder', { ...data, title: 'Constructor de Flujos', isFlowBuilder: true });
  }
}

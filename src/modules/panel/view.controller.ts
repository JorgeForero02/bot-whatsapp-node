import { Controller, Get, Res, Logger } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ConfigService } from '@nestjs/config';
import { OnboardingService } from '../onboarding/onboarding.service';
import { SettingsService } from '../settings/settings.service';

@Controller()
export class ViewController {
  private readonly logger = new Logger(ViewController.name);

  constructor(
    private readonly onboarding: OnboardingService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
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
    } catch { }

    try {
      const botMode = await this.settings.get('bot_mode');
      showFlowBuilder = botMode === 'classic';
    } catch { }

    const apiToken = this.config.get<string>('app.apiPanelToken') ?? '';
    return {
      onboarding,
      showFlowBuilder,
      apiToken,
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
      extraHead: '<script src="/assets/js/chart.umd.min.js"></script>',
      extraScripts: '<script src="/assets/js/dashboard.js"></script>',
    });
  }

  @Get('conversations')
  async conversations(@Res() reply: FastifyReply): Promise<void> {
    const data = await this.getLayoutData('Conversations');
    await this.render(reply, 'conversations', {
      ...data,
      title: 'Conversaciones',
      isConversations: true,
      extraScripts: '<script src="/assets/js/conversations.js"></script>',
    });
  }

  @Get('documents')
  async documents(@Res() reply: FastifyReply): Promise<void> {
    const data = await this.getLayoutData('Documents');
    await this.render(reply, 'documents', {
      ...data,
      title: 'Documentos',
      isDocuments: true,
      extraScripts: '<script src="/assets/js/documents.js"></script>',
    });
  }

  @Get('settings')
  async settingsPage(@Res() reply: FastifyReply): Promise<void> {
    const data = await this.getLayoutData('Settings');
    await this.render(reply, 'settings', {
      ...data,
      title: 'Configuración',
      isSettings: true,
      extraScripts: '<script src="/assets/js/settings.js"></script>',
    });
  }

  @Get('calendar-settings')
  async calendarSettings(@Res() reply: FastifyReply): Promise<void> {
    const data = await this.getLayoutData('CalendarSettings');
    await this.render(reply, 'calendar-settings', {
      ...data,
      title: 'Horarios Calendar',
      isCalendarSettings: true,
      extraScripts: '<script src="/assets/js/calendar-settings.js"></script>',
    });
  }

  @Get('credentials')
  async credentials(@Res() reply: FastifyReply): Promise<void> {
    const data = await this.getLayoutData('Credentials');
    await this.render(reply, 'credentials', {
      ...data,
      title: 'Credenciales',
      isCredentials: true,
      extraScripts: '<script src="/assets/js/settings-credentials.js"></script>',
    });
  }

  @Get('onboarding')
  async onboardingPage(@Res() reply: FastifyReply): Promise<void> {
    const data = await this.getLayoutData('Onboarding');
    await this.render(reply, 'onboarding', {
      ...data,
      title: 'Configuración Inicial',
      extraScripts: '<script src="/assets/js/onboarding.js"></script>',
    });
  }

  @Get('flow-builder')
  async flowBuilder(@Res() reply: FastifyReply): Promise<void> {
    const data = await this.getLayoutData('FlowBuilder');
    let calendarEnabled = false;
    try {
      const calEnabled = await this.settings.get('calendar_enabled');
      calendarEnabled = calEnabled === 'true';
    } catch { }
    await this.render(reply, 'flow-builder', {
      ...data,
      title: 'Constructor de Flujos',
      isFlowBuilder: true,
      calendarEnabled,
      extraScripts: '<script src="/assets/js/flow-builder.js"></script>',
      inlineScripts: `<script>const CALENDAR_ENABLED = ${calendarEnabled};</script>`,
    });
  }
}

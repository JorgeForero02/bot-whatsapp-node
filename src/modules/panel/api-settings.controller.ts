import { Controller, Get, Post, Body, Param, Logger, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiAuthGuard } from '../../common/guards/api-auth.guard';
import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OnboardingService } from '../onboarding/onboarding.service';
import { DatabaseService } from '../database/database.service';
import { GoogleCalendarService } from '../calendar/google-calendar.service';
import { RedisService } from '../queue/redis.service';
import { SettingsService } from '../settings/settings.service';
import { calendarSettings } from '../database/schema/calendar-settings.schema';

@UseGuards(ApiAuthGuard)
@Controller('api')
export class ApiSettingsController {
  private readonly logger = new Logger(ApiSettingsController.name);

  constructor(
    private readonly onboarding: OnboardingService,
    private readonly db: DatabaseService,
    private readonly googleCalendar: GoogleCalendarService,
    @InjectQueue('webhook-queue') private readonly webhookQueue: Queue,
    @InjectQueue('reindex-queue') private readonly reindexQueue: Queue,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
  ) {}

  @Get('settings')
  async getSettings(): Promise<Record<string, unknown>> {
    const data = await this.settings.getAll();
    return { success: true, data };
  }

  @Post('settings')
  @HttpCode(HttpStatus.OK)
  async saveSettings(@Body() body: Record<string, string>): Promise<Record<string, unknown>> {
    let oldEmbeddingModel: string | null = null;
    let newEmbeddingModel: string | null = null;

    if (body['openai_embedding_model']) {
      oldEmbeddingModel = await this.settings.get('openai_embedding_model');
      newEmbeddingModel = body['openai_embedding_model'];
    }

    for (const [key, value] of Object.entries(body)) {
      await this.settings.set(key, value);
    }

    if (newEmbeddingModel && oldEmbeddingModel && newEmbeddingModel !== oldEmbeddingModel) {
      const jobId = randomUUID();
      await this.reindexQueue.add('reindex', { newModel: newEmbeddingModel, jobId }, {
        jobId,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: false,
      });
      this.logger.log(`Embedding model changed: ${oldEmbeddingModel} → ${newEmbeddingModel}. Reindex job ${jobId} enqueued.`);
      return { success: true, reindexJobId: jobId };
    }

    return { success: true };
  }

  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  async forceReindex(): Promise<Record<string, unknown>> {
    try {
      const currentModel = await this.settings.get('openai_embedding_model', 'text-embedding-ada-002');
      const jobId = randomUUID();
      await this.reindexQueue.add('reindex', { newModel: currentModel, jobId }, {
        jobId,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: false,
      });
      this.logger.log(`Force reindex triggered with model ${currentModel}, job ${jobId}`);
      return { success: true, reindexJobId: jobId, model: currentModel };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }

  @Get('onboarding-progress')
  async getOnboardingProgress(): Promise<Record<string, unknown>> {
    const progress = await this.onboarding.getProgress();
    const currentStep = await this.onboarding.getCurrentStep();
    return { success: true, data: { ...progress, currentStep } };
  }

  @Post('onboarding-progress')
  @HttpCode(HttpStatus.OK)
  async updateOnboardingProgress(
    @Body() body: { step: string; action: 'complete' | 'skip' },
  ): Promise<Record<string, unknown>> {
    if (body.action === 'complete') {
      await this.onboarding.completeStep(body.step);
    } else {
      await this.onboarding.skipStep(body.step);
    }
    return { success: true };
  }

  @Post('onboarding-reset')
  @HttpCode(HttpStatus.OK)
  async resetOnboarding(): Promise<Record<string, unknown>> {
    await this.onboarding.resetOnboarding();
    return { success: true };
  }

  @Get('calendar-settings')
  async getCalendarSettings(): Promise<Record<string, unknown>> {
    const rows = await this.db.db.select().from(calendarSettings);
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.settingKey] = row.settingValue;
    }
    return { success: true, data: result };
  }

  @Post('calendar-settings')
  @HttpCode(HttpStatus.OK)
  async saveCalendarSettings(@Body() body: Record<string, string>): Promise<Record<string, unknown>> {
    for (const [key, value] of Object.entries(body)) {
      await this.db.db
        .insert(calendarSettings)
        .values({ settingKey: key, settingValue: value })
        .onDuplicateKeyUpdate({ set: { settingValue: value } });
    }
    return { success: true };
  }

  @Get('calendar-events')
  async getCalendarEvents(): Promise<Record<string, unknown>> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const events = await this.googleCalendar.getEventsByDateRange(today, today, 20);
      return { success: true, data: events.items ?? [] };
    } catch (error: unknown) {
      this.logger.warn('Failed to fetch calendar events', error instanceof Error ? error.message : '');
      return { success: true, data: [] };
    }
  }

  @Get('health')
  getHealth(): Record<string, unknown> {
    return {
      success: true,
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Post('queue-flush')
  @HttpCode(HttpStatus.OK)
  async flushQueue(): Promise<Record<string, unknown>> {
    try {
      await this.webhookQueue.obliterate({ force: true });
      return { success: true, message: 'Queue cleared' };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Error' };
    }
  }

  @Get('reindex/progress/:jobId')
  async getReindexProgress(@Param('jobId') jobId: string): Promise<Record<string, unknown>> {
    try {
      const client = this.redis.getClient();
      const progress = await client.get(`reindex:progress:${jobId}`);
      const status = await client.get(`reindex:status:${jobId}`);

      if (!status && !progress) {
        return { success: true, data: { progress: 0, status: 'not_found' } };
      }

      return {
        success: true,
        data: {
          progress: progress ? parseInt(progress, 10) : 0,
          status: status ?? 'running',
        },
      };
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Error' };
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { eq, asc, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { SettingsService } from '../settings/settings.service';
import { onboardingProgress } from '../database/schema/onboarding-progress.schema';
import { botCredentials } from '../database/schema/bot-credentials.schema';

const ONBOARDING_STEPS = [
  { name: 'whatsapp_credentials', order: 1, skippable: false },
  { name: 'openai_credentials', order: 2, skippable: true },
  { name: 'bot_personality', order: 3, skippable: false },
  { name: 'calendar_setup', order: 4, skippable: true },
  { name: 'flow_builder', order: 5, skippable: true },
  { name: 'test_connection', order: 6, skippable: false },
  { name: 'go_live', order: 7, skippable: false },
] as const;

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly settings: SettingsService,
  ) {}

  async getCurrentStep(): Promise<{ name: string; order: number } | null> {
    await this.ensureStepsExist();

    const steps = await this.db.db
      .select()
      .from(onboardingProgress)
      .where(eq(onboardingProgress.isCompleted, false))
      .orderBy(asc(onboardingProgress.stepOrder));

    const incomplete = steps.filter((s) => !s.isSkipped);
    if (incomplete.length === 0) return null;

    return { name: incomplete[0].stepName, order: incomplete[0].stepOrder };
  }

  async completeStep(stepName: string): Promise<void> {
    await this.db.db
      .update(onboardingProgress)
      .set({ isCompleted: true, completedAt: new Date() })
      .where(eq(onboardingProgress.stepName, stepName));
  }

  async skipStep(stepName: string): Promise<void> {
    const step = ONBOARDING_STEPS.find((s) => s.name === stepName);
    if (!step || !step.skippable) {
      throw new Error(`Step ${stepName} cannot be skipped`);
    }

    await this.db.db
      .update(onboardingProgress)
      .set({ isSkipped: true })
      .where(eq(onboardingProgress.stepName, stepName));
  }

  async getProgress(): Promise<{
    steps: Array<{ name: string; order: number; isCompleted: boolean; isSkipped: boolean }>;
    completedCount: number;
    totalCount: number;
  }> {
    try {
      await this.ensureStepsExist();

      const steps = await this.db.db
        .select()
        .from(onboardingProgress)
        .orderBy(asc(onboardingProgress.stepOrder));

      const completedCount = steps.filter((s) => s.isCompleted || s.isSkipped).length;

      return {
        steps: steps.map((s) => ({
          name: s.stepName,
          order: s.stepOrder,
          isCompleted: s.isCompleted ?? false,
          isSkipped: s.isSkipped ?? false,
        })),
        completedCount,
        totalCount: steps.length,
      };
    } catch (error) {
      this.logger.error('Error getting onboarding progress:', error);
      return {
        steps: ONBOARDING_STEPS.map((s) => ({
          name: s.name,
          order: s.order,
          isCompleted: false,
          isSkipped: false,
        })),
        completedCount: 0,
        totalCount: ONBOARDING_STEPS.length,
      };
    }
  }

  async isOnboardingComplete(): Promise<boolean> {
    const progress = await this.getProgress();
    return progress.completedCount >= progress.totalCount;
  }

  async resetOnboarding(): Promise<void> {
    await this.db.db
      .update(onboardingProgress)
      .set({ isCompleted: false, isSkipped: false, completedAt: null });
  }

  async autoDetectProgress(): Promise<void> {
    try {
      const creds = await this.db.db
        .select()
        .from(botCredentials)
        .where(eq(botCredentials.id, 1))
        .limit(1);

      if (creds.length > 0 && creds[0].whatsappAccessToken) {
        await this.completeStep('whatsapp_credentials');
      }
      if (creds.length > 0 && creds[0].openaiApiKey) {
        await this.completeStep('openai_credentials');
      }
    } catch {
      this.logger.debug('autoDetectProgress: credentials table not ready');
    }

    try {
      const botNameValue = await this.settings.get('bot_name');
      const DEFAULT_BOT_NAME = 'WhatsApp Bot';
      if (botNameValue && botNameValue !== DEFAULT_BOT_NAME) {
        await this.completeStep('bot_personality');
      }

      const botModeValue = await this.settings.get('bot_mode');
      if (botModeValue === 'ai') {
        await this.skipStep('flow_builder');
      }
    } catch {
      this.logger.debug('autoDetectProgress: settings table not ready');
    }
  }

  private async ensureStepsExist(): Promise<void> {
    try {
      const existing = await this.db.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(onboardingProgress);

      if ((existing[0]?.count ?? 0) === 0) {
        for (const step of ONBOARDING_STEPS) {
          try {
            await this.db.db.insert(onboardingProgress).values({
              stepName: step.name,
              stepOrder: step.order,
              isCompleted: false,
              isSkipped: false,
            });
          } catch (insertError) {
            this.logger.debug(`Step ${step.name} might already exist, skipping insert`);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error ensuring onboarding steps exist:', error);
      throw error;
    }
  }
}

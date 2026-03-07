import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { OnboardingService } from '../../modules/onboarding/onboarding.service';

@Injectable()
export class OnboardingGuard implements CanActivate {
  private readonly logger = new Logger(OnboardingGuard.name);

  constructor(private readonly onboarding: OnboardingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ url: string }>();
    const url = request.url;

    if (url.startsWith('/api/') || url.startsWith('/webhook') || url === '/onboarding') {
      return true;
    }

    try {
      const complete = await this.onboarding.isOnboardingComplete();
      if (!complete) {
        const response = context.switchToHttp().getResponse<{ redirect: (url: string) => void }>();
        response.redirect('/onboarding');
        return false;
      }
    } catch (error: unknown) {
      this.logger.warn('Onboarding guard check failed, allowing access', error instanceof Error ? error.message : '');
    }

    return true;
  }
}

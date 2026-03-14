import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { OnboardingService } from '../../modules/onboarding/onboarding.service';

const BYPASS_PREFIXES = ['/api/', '/webhook', '/assets/'];
const BYPASS_EXACT_PATHS = ['/onboarding'];

@Injectable()
export class OnboardingGuard implements CanActivate {
  private readonly logger = new Logger(OnboardingGuard.name);

  constructor(private readonly onboarding: OnboardingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ url: string }>();
    const url = request.url;

    const shouldBypass =
      BYPASS_PREFIXES.some((prefix) => url.startsWith(prefix)) ||
      BYPASS_EXACT_PATHS.some((path) => url === path || url.startsWith(`${path}?`));

    if (shouldBypass) {
      return true;
    }

    try {
      const complete = await this.onboarding.isOnboardingComplete();
      if (!complete) {
        const response = context.switchToHttp().getResponse<{ redirect: (statusCode: number, url: string) => void }>();
        response.redirect(302, '/onboarding');
        return false;
      }
    } catch (error: unknown) {
      this.logger.warn('Onboarding guard check failed, allowing access', error instanceof Error ? error.message : '');
    }

    return true;
  }
}

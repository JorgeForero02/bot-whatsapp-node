import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';

@Injectable()
export class ApiAuthGuard implements CanActivate {
  private readonly logger = new Logger(ApiAuthGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const token = this.config.get<string>('app.apiPanelToken');
    const nodeEnv = this.config.get<string>('app.nodeEnv');

    if (!token) {
      if (nodeEnv === 'production') {
        this.logger.error('API_PANEL_TOKEN is not configured in production — blocking all /api/* access');
        throw new UnauthorizedException('API authentication not configured');
      }
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers['authorization'] as string | undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const provided = authHeader.slice(7);
    if (provided !== token) {
      this.logger.warn('API auth failed: invalid token');
      throw new UnauthorizedException('Invalid API token');
    }

    return true;
  }
}

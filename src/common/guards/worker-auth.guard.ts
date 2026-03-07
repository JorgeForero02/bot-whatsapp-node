import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';

@Injectable()
export class WorkerAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.config.get<string>('bullBoard.token');

    if (!token) return true;

    const authHeader = request.headers['authorization'] as string | undefined;
    const queryToken = (request.query as Record<string, string>)['token'];

    if (authHeader === `Bearer ${token}`) return true;
    if (queryToken === token) return true;

    return false;
  }
}

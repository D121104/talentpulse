import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

/**
 * Protects the Prometheus `/metrics` endpoint using a constant-time bearer
 * token check when `METRICS_BEARER_TOKEN` is configured.
 */
@Injectable()
export class MetricsAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedToken = String(
      this.configService.get<string>('METRICS_BEARER_TOKEN') ?? '',
    ).trim();
    if (!expectedToken) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request?.headers?.authorization;
    if (typeof authHeader !== 'string') {
      throw new UnauthorizedException('Missing metrics bearer token');
    }

    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (!match) {
      throw new UnauthorizedException('Invalid metrics authorization header');
    }

    const providedToken = match[1].trim();
    const expectedBuffer = Buffer.from(expectedToken, 'utf8');
    const providedBuffer = Buffer.from(providedToken, 'utf8');

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new UnauthorizedException('Invalid metrics bearer token');
    }

    return true;
  }
}

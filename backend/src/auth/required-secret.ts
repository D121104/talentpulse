import { ConfigService } from '@nestjs/config';

/** Resolve a required secret without providing a development fallback. */
export function requiredSecret(
  configService: ConfigService,
  name: string,
): string {
  const secret = configService.get<string>(name)?.trim();
  if (!secret) {
    throw new Error(`${name} is required`);
  }
  return secret;
}

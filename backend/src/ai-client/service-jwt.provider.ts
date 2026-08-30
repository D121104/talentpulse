import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createPrivateKey, KeyObject, randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { resolve, isAbsolute } from 'path';
import {
  IssuedServiceToken,
  ServiceJwtClaims,
  ServiceJwtScope,
} from './contracts/service-jwt.contracts';
import { AiServiceError, AiServiceErrorCode } from './ai-client.errors';

export const ServiceJwtKeyLoaderToken = Symbol('ServiceJwtKeyLoader');

export interface ServiceJwtKeyLoader {
  loadPrivateKey(): Promise<string>;
}

@Injectable()
export class EnvironmentServiceJwtKeyLoader implements ServiceJwtKeyLoader {
  constructor(private readonly configService: ConfigService) {}

  async loadPrivateKey(): Promise<string> {
    const inlineKey = this.configService.get<string>(
      'AI_SERVICE_JWT_PRIVATE_KEY',
    );
    const keyPath = this.configService.get<string>(
      'AI_SERVICE_JWT_PRIVATE_KEY_FILE',
    );
    if (inlineKey && keyPath) {
      throw new AiServiceError(
        AiServiceErrorCode.AI_CLIENT_NOT_CONFIGURED,
        'Configure exactly one AI service JWT private key source',
        503,
        false,
      );
    }
    if (inlineKey?.trim()) return inlineKey.replace(/\\n/g, '\n').trim();
    if (!keyPath?.trim()) {
      throw new AiServiceError(
        AiServiceErrorCode.AI_CLIENT_NOT_CONFIGURED,
        'AI service JWT private key is not configured',
        503,
        false,
      );
    }
    try {
      const privateKey = await readFile(
        isAbsolute(keyPath) ? keyPath : resolve(process.cwd(), keyPath),
        'utf8',
      );
      if (!privateKey.trim()) throw new Error('empty private key');
      return privateKey.trim();
    } catch {
      throw new AiServiceError(
        AiServiceErrorCode.AI_CLIENT_NOT_CONFIGURED,
        'AI service JWT private key file cannot be loaded',
        503,
        false,
      );
    }
  }
}

export interface ServiceJwtIssuer {
  issue(scope: ServiceJwtScope): Promise<IssuedServiceToken>;
}

@Injectable()
export class FileBackedServiceJwtProvider implements ServiceJwtIssuer {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly keyLoader: ServiceJwtKeyLoader,
    private readonly nowSeconds: () => number = () =>
      Math.floor(Date.now() / 1000),
  ) {}

  async issue(scope: ServiceJwtScope): Promise<IssuedServiceToken> {
    if (!Object.values(ServiceJwtScope).includes(scope)) {
      throw new AiServiceError(
        AiServiceErrorCode.AI_CLIENT_NOT_CONFIGURED,
        'AI service JWT scope is invalid',
        503,
        false,
      );
    }
    const issuer = this.required('AI_SERVICE_ISSUER');
    const audience = this.required('AI_SERVICE_AUDIENCE');
    const algorithm = this.configService.get<'RS256' | 'ES256'>(
      'AI_SERVICE_JWT_ALGORITHM',
      'RS256',
    );
    const ttlSeconds = Number(
      this.configService.get('AI_SERVICE_JWT_TTL_SECONDS', 60),
    );
    const keyId = this.required('AI_SERVICE_JWT_KID');
    if (
      !['RS256', 'ES256'].includes(algorithm) ||
      !Number.isInteger(ttlSeconds) ||
      ttlSeconds < 1 ||
      ttlSeconds > 300
    ) {
      throw new AiServiceError(
        AiServiceErrorCode.AI_CLIENT_NOT_CONFIGURED,
        'AI service JWT configuration is invalid',
        503,
        false,
      );
    }

    const iat = this.nowSeconds();
    const subject = this.configService
      .get<string>('AI_SERVICE_SUBJECT', 'talentpulse-api')
      .trim();
    if (!subject)
      throw new AiServiceError(
        AiServiceErrorCode.AI_CLIENT_NOT_CONFIGURED,
        'AI_SERVICE_SUBJECT is not configured',
        503,
        false,
      );
    const claims: ServiceJwtClaims = {
      sub: subject,
      iss: issuer,
      aud: audience,
      scope,
      iat,
      exp: iat + ttlSeconds,
      jti: randomUUID(),
      kid: keyId,
    };
    const privateKey = this.asymmetricPrivateKey(
      await this.keyLoader.loadPrivateKey(),
      algorithm,
    );
    const token = await this.jwtService.signAsync(claims, {
      privateKey,
      algorithm,
      keyid: keyId,
    });
    return { token, claims };
  }

  private asymmetricPrivateKey(
    value: string,
    algorithm: 'RS256' | 'ES256',
  ): KeyObject {
    try {
      const key = createPrivateKey(value);
      const expectedType = algorithm === 'RS256' ? 'rsa' : 'ec';
      if (key.asymmetricKeyType !== expectedType)
        throw new Error('private key algorithm does not match JWT algorithm');
      return key;
    } catch (error) {
      if (error instanceof AiServiceError) throw error;
      throw new AiServiceError(
        AiServiceErrorCode.AI_CLIENT_NOT_CONFIGURED,
        'AI service JWT private key is invalid',
        503,
        false,
      );
    }
  }

  private required(key: string): string {
    const value = this.configService.get<string>(key)?.trim();
    if (!value)
      throw new AiServiceError(
        AiServiceErrorCode.AI_CLIENT_NOT_CONFIGURED,
        `${key} is not configured`,
        503,
        false,
      );
    return value;
  }
}

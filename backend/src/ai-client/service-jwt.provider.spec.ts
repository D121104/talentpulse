import { ServiceJwtScope } from './contracts/service-jwt.contracts';
import {
  EnvironmentServiceJwtKeyLoader,
  FileBackedServiceJwtProvider,
} from './service-jwt.provider';
import { generateKeyPairSync } from 'crypto';

const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString();

describe('FileBackedServiceJwtProvider', () => {
  const values: Record<string, unknown> = {
    AI_SERVICE_ISSUER: 'talentpulse-api',
    AI_SERVICE_AUDIENCE: 'talentpulse-ai',
    AI_SERVICE_SUBJECT: 'talentpulse-nest',
    AI_SERVICE_JWT_ALGORITHM: 'RS256',
    AI_SERVICE_JWT_TTL_SECONDS: 60,
    AI_SERVICE_JWT_KID: 'dev-key-1',
  };

  it('issues an RS256 token with required service claims and configured key reference', async () => {
    const keyLoader = {
      loadPrivateKey: jest.fn().mockResolvedValue(privateKey),
    };
    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('service-token'),
    };
    const config = {
      get: jest.fn(
        (key: string, fallback?: unknown) => values[key] ?? fallback,
      ),
    };
    const provider = new FileBackedServiceJwtProvider(
      config as never,
      jwtService as never,
      keyLoader,
      () => 1_700_000_000,
    );
    const result = await provider.issue(ServiceJwtScope.RagRetrieve);

    expect(result).toMatchObject({
      token: 'service-token',
      claims: {
        iss: 'talentpulse-api',
        aud: 'talentpulse-ai',
        scope: 'rag:retrieve',
        iat: 1_700_000_000,
        exp: 1_700_000_060,
        kid: 'dev-key-1',
        jti: expect.any(String),
      },
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining(result.claims),
      expect.objectContaining({
        privateKey: expect.anything(),
        algorithm: 'RS256',
        keyid: 'dev-key-1',
      }),
    );
  });

  it('does not load a private key until a token is issued', () => {
    const keyLoader = { loadPrivateKey: jest.fn() };
    const config = {
      get: jest.fn(
        (key: string, fallback?: unknown) => values[key] ?? fallback,
      ),
    };
    new FileBackedServiceJwtProvider(config as never, {} as never, keyLoader);
    expect(keyLoader.loadPrivateKey).not.toHaveBeenCalled();
  });

  it('rejects configuring both private key sources when issuing', async () => {
    const config = {
      get: jest.fn(
        (key: string, fallback?: unknown) =>
          ({
            ...values,
            AI_SERVICE_JWT_PRIVATE_KEY: 'inline',
            AI_SERVICE_JWT_PRIVATE_KEY_FILE: 'file',
          }[key] ?? fallback),
      ),
    };
    await expect(
      new EnvironmentServiceJwtKeyLoader(config as never).loadPrivateKey(),
    ).rejects.toMatchObject({ code: 'AI_CLIENT_NOT_CONFIGURED' });
  });
});

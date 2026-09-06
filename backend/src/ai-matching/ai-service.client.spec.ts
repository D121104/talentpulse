import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';
import { AiServiceClient } from './ai-service.client';

jest.mock('axios');
const request = axios.request as jest.Mock;
const config = (values: Record<string, string>) => new ConfigService(values);
const parseRequest = {
  cv_id: '00000000-0000-4000-8000-000000000001',
  filename: 'cv.pdf',
  media_type: 'application/pdf' as const,
  content_base64: 'JVBERi0=',
  content_version: 1,
};
const matchRequest = {
  cv_id: '00000000-0000-4000-8000-000000000001',
  job_id: '00000000-0000-4000-8000-000000000002',
  candidate: {
    skills: ['TypeScript'],
    years_experience: null,
    level: null,
    location: null,
    work_modes: [],
  },
  job: {
    required_skills: ['TypeScript'],
    preferred_skills: [],
    min_years_experience: null,
    max_years_experience: null,
    level: null,
    location: null,
    work_modes: [],
  },
};
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const auth = {
  AI_SERVICE_URL: 'https://ai.internal',
  AI_SERVICE_ISSUER: 'backend',
  AI_SERVICE_AUDIENCE: 'ai',
  AI_SERVICE_JWT_ALGORITHM: 'RS256',
  AI_SERVICE_JWT_PRIVATE_KEY: privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString(),
};

describe('AiServiceClient', () => {
  beforeEach(() => request.mockReset());
  it('rejects missing authentication configuration without making a request', async () => {
    await expect(
      new AiServiceClient(
        new ConfigService({ AI_SERVICE_URL: 'https://ai.internal' }),
      ).parseCv(parseRequest),
    ).rejects.toMatchObject({ code: 'AI_SERVICE_NOT_CONFIGURED' });
    expect(request).not.toHaveBeenCalled();
  });
  it('maps timeout and provider errors to sanitized codes', async () => {
    const client = new AiServiceClient(config(auth));
    request.mockRejectedValueOnce(
      Object.assign(new Error('secret'), {
        code: 'ETIMEDOUT',
        isAxiosError: true,
        toJSON: () => ({}),
      }),
    );
    await expect(client.matchCv(matchRequest)).rejects.toMatchObject({
      code: 'AI_SERVICE_TIMEOUT',
      message: 'AI service request timed out',
    });
    request.mockResolvedValueOnce({
      status: 422,
      data: { detail: { code: 'parse_failed', message: 'private details' } },
    });
    await expect(client.matchCv(matchRequest)).rejects.toMatchObject({
      code: 'AI_SERVICE_REJECTED',
      message: 'AI service rejected the request',
    });
  });
  it('rejects response identity/version mismatches and unsupported fields', async () => {
    const client = new AiServiceClient(config(auth));
    request.mockResolvedValue({
      status: 200,
      data: {
        cv_id: '00000000-0000-4000-8000-000000000003',
        content_version: 1,
        media_type: 'application/pdf',
        content_sha256: 'a'.repeat(64),
        extracted_text: 'text',
        text_char_count: 4,
        parser_version: 'v1',
      },
    });
    await expect(client.parseCv(parseRequest)).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
    });
  });
});

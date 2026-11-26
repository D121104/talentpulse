import { ConfigService } from '@nestjs/config';
import { requiredSecret } from 'src/auth/required-secret';

describe('requiredSecret', () => {
  it('returns a configured non-empty secret', () => {
    const config = {
      get: jest.fn().mockReturnValue('configured-secret'),
    } as unknown as ConfigService;

    expect(requiredSecret(config, 'JWT_SECRET')).toBe('configured-secret');
  });

  it('fails closed when a secret is missing', () => {
    const config = {
      get: jest.fn().mockReturnValue('   '),
    } as unknown as ConfigService;

    expect(() => requiredSecret(config, 'JWT_SECRET')).toThrow(
      'JWT_SECRET is required',
    );
  });
});

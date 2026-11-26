import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsAuthGuard } from 'src/observability/metrics-auth.guard';

function createHttpContext(headers: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('MetricsAuthGuard', () => {
  it.each([undefined, '', '   '])(
    'allows open access when METRICS_BEARER_TOKEN is %p',
    (token) => {
      const guard = new MetricsAuthGuard(
        new ConfigService(
          token === undefined ? {} : { METRICS_BEARER_TOKEN: token },
        ),
      );

      expect(guard.canActivate(createHttpContext({}))).toBe(true);
    },
  );

  it('allows requests carrying the matching Bearer token', () => {
    const guard = new MetricsAuthGuard(
      new ConfigService({ METRICS_BEARER_TOKEN: '  top-secret-token  ' }),
    );

    expect(
      guard.canActivate(
        createHttpContext({ authorization: 'Bearer top-secret-token' }),
      ),
    ).toBe(true);

    expect(
      guard.canActivate(
        createHttpContext({ authorization: 'bearer   top-secret-token  ' }),
      ),
    ).toBe(true);
  });

  it('rejects requests with missing, malformed, or wrong Bearer tokens', () => {
    const guard = new MetricsAuthGuard(
      new ConfigService({ METRICS_BEARER_TOKEN: 'secret-123' }),
    );

    const invalidHeaders: Array<Record<string, unknown>> = [
      {},
      { authorization: ['Bearer secret-123'] },
      { authorization: 'Basic c2VjcmV0' },
      { authorization: 'Bearer' },
      { authorization: 'Bearer   ' },
      { authorization: 'Bearer short' },
      { authorization: 'Bearer secret-999' },
    ];

    for (const headers of invalidHeaders) {
      expect(() => guard.canActivate(createHttpContext(headers))).toThrow(
        UnauthorizedException,
      );
    }
  });
});

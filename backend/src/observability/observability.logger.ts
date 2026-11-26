import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';
import { Params } from 'nestjs-pino';
import { join } from 'path';
import pino from 'pino';
import pinoPretty from 'pino-pretty';
import {
  extractRequestPathname,
  LOG_IGNORED_PATHS,
} from './observability.constants';

const MAX_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID_PATTERN = /^[^\s\x00-\x1f\x7f]+$/;

const REDACTED_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  "res.headers['set-cookie']",
  '*.password',
  '*.refreshToken',
  '*.accessToken',
  '*.token',
  '*.secret',
];

function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const header = req.headers['x-request-id'];
  const raw = Array.isArray(header) ? header[0] : header;
  const candidate = typeof raw === 'string' ? raw.trim() : '';

  const requestId =
    candidate.length > 0 &&
    candidate.length <= MAX_REQUEST_ID_LENGTH &&
    SAFE_REQUEST_ID_PATTERN.test(candidate)
      ? candidate
      : randomUUID();

  if (typeof res?.setHeader === 'function') {
    res.setHeader('x-request-id', requestId);
  }

  return requestId;
}

/**
 * Builds nestjs-pino configuration with request correlation, redaction,
 * and synchronous multistream outputs without spawning transport worker threads.
 */
export function createPinoLoggerOptions(configService: ConfigService): Params {
  const nodeEnv = String(
    configService.get<string>('NODE_ENV') ??
      process.env.NODE_ENV ??
      'development',
  )
    .trim()
    .toLowerCase();
  const isTest = nodeEnv === 'test';

  const configuredLevel = String(
    configService.get<string>('LOG_LEVEL') ?? process.env.LOG_LEVEL ?? 'info',
  )
    .trim()
    .toLowerCase();
  const level = (
    isTest ? 'silent' : configuredLevel || 'info'
  ) as pino.LevelWithSilent;

  const logFileEnabled =
    String(
      configService.get<string>('LOG_FILE_ENABLED') ??
        process.env.LOG_FILE_ENABLED ??
        'true',
    )
      .trim()
      .toLowerCase() !== 'false';

  const logPretty =
    String(
      configService.get<string>('LOG_PRETTY') ??
        process.env.LOG_PRETTY ??
        'true',
    )
      .trim()
      .toLowerCase() !== 'false';

  const configuredLogDir = String(
    configService.get<string>('LOG_DIR') ?? process.env.LOG_DIR ?? '',
  ).trim();
  const logDir = configuredLogDir || join(process.cwd(), 'logs');

  const streams: pino.StreamEntry<pino.LevelWithSilent>[] = [];

  if (!isTest) {
    if (logFileEnabled) {
      streams.push({
        level,
        stream: pino.destination({
          dest: join(logDir, 'app.log'),
          mkdir: true,
          sync: false,
        }),
      });
    }

    if (['development', 'local'].includes(nodeEnv) && logPretty) {
      streams.push({
        level,
        stream: pinoPretty({
          colorize: true,
          singleLine: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
        }),
      });
    } else {
      streams.push({
        level,
        stream: process.stdout,
      });
    }
  }

  return {
    pinoHttp: {
      level,
      genReqId: resolveRequestId,
      customProps: (req: IncomingMessage & { id?: unknown }) =>
        req.id !== undefined && req.id !== null
          ? { reqId: String(req.id) }
          : {},
      redact: REDACTED_LOG_PATHS,
      formatters: {
        level: (label: string) => ({ level: label }),
      },
      autoLogging: {
        ignore: (req: IncomingMessage & { originalUrl?: string }) =>
          LOG_IGNORED_PATHS.has(extractRequestPathname(req)),
      },
      stream: pino.multistream(streams),
    },
  };
}

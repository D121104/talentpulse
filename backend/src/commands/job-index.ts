import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { JobIndexingService } from 'src/job-indexing/job-indexing.service';

function readOption(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const indexing = app.get(JobIndexingService);
    const maxOperations = Number(readOption('max-operations', '100'));
    const environment = readOption(
      'environment',
      process.env.NODE_ENV ?? 'development',
    );
    if (!environment) throw new Error('environment is required');
    if (
      !Number.isInteger(maxOperations) ||
      maxOperations < 1 ||
      maxOperations > 10000
    ) {
      throw new Error(
        '--max-operations must be an integer between 1 and 10000',
      );
    }
    if (process.argv.includes('--initialize')) {
      await indexing.initializeIndex();
      process.stdout.write(JSON.stringify({ initialized: true }) + '\n');
    } else {
      const result = await indexing.backfill(
        maxOperations,
        process.argv.includes('--reconcile'),
      );
      process.stdout.write(JSON.stringify({ environment, ...result }) + '\n');
    }
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});

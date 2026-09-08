import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { Job } from '../jobs/entities/job.entity';
import { Company } from '../companies/entities/company.entity';
import { JobIndexOutbox } from '../job-indexing/entities/job-index-outbox.entity';
import { JobIndexingService } from '../job-indexing/job-indexing.service';
import { getJobSourceVersion } from '../job-indexing/job-indexing.normalization';
import {
  JOB_EMBEDDING_DIMENSIONS,
  JOB_INDEX_ALIAS,
  JOB_INDEX_COLLECTION,
  JOB_INDEX_VERSION,
} from '../job-indexing/job-indexing.constants';
import { readFileSync, statSync } from 'fs';

function option(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function verifyMetadataFile(): void {
  const file = process.env.DEMO_QDRANT_METADATA_FILE;
  if (!file) {
    throw new Error(
      'Qdrant metadata evidence is required; TODO: provide a reviewed adapter-boundary verification file in DEMO_QDRANT_METADATA_FILE',
    );
  }
  const mode = statSync(file).mode & 0o777;
  if ((mode & 0o077) !== 0)
    throw new Error(
      'Qdrant metadata evidence file must not be group/world readable',
    );
  const value = JSON.parse(readFileSync(file, 'utf8')) as {
    collection?: unknown;
    alias?: unknown;
    version?: unknown;
    dimensions?: unknown;
    payload_indexes?: unknown;
  };
  const requiredIndexes = [
    'job_id',
    'company_id',
    'status',
    'is_active',
    'is_deleted',
    'company_is_active',
    'location',
    'level',
    'representation_version',
  ];
  if (
    value.collection !== JOB_INDEX_COLLECTION ||
    value.alias !== JOB_INDEX_ALIAS ||
    value.version !== JOB_INDEX_VERSION ||
    value.dimensions !== JOB_EMBEDDING_DIMENSIONS
  ) {
    throw new Error(
      'Qdrant metadata evidence does not match the demo index contract',
    );
  }
  if (
    !Array.isArray(value.payload_indexes) ||
    !value.payload_indexes.every((item) => typeof item === 'string') ||
    !requiredIndexes.every((item) =>
      (value.payload_indexes as string[]).includes(item),
    )
  ) {
    throw new Error(
      'Qdrant metadata evidence is missing a required payload index',
    );
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'demo')
    throw new Error('NODE_ENV must be exactly demo');
  if (process.env.DB_DATABASE !== 'talentpulse_demo')
    throw new Error('DB_DATABASE must be exactly talentpulse_demo');
  if (process.env.DB_SYNCHRONIZE !== 'false')
    throw new Error('DB_SYNCHRONIZE must be exactly false');
  const maxOperations = Number(
    option('max-operations', process.env.DEMO_INDEX_MAX_OPERATIONS ?? '25'),
  );
  if (
    !Number.isInteger(maxOperations) ||
    maxOperations < 1 ||
    maxOperations > 100
  ) {
    throw new Error('--max-operations must be an integer between 1 and 100');
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const indexing = app.get(JobIndexingService);
    const dataSource = app.get(DataSource);
    const companyName =
      process.env.DEMO_SEED_COMPANY_NAME?.trim() || 'TalentPulse Demo Labs';
    const companyRepo = dataSource.getRepository(Company);
    const jobRepo = dataSource.getRepository(Job);
    const outboxRepo = dataSource.getRepository(JobIndexOutbox);
    const company = await companyRepo.findOne({ where: { name: companyName } });
    if (!company) throw new Error('demo seed company was not found');
    const jobs = (await jobRepo.find({ withDeleted: false })).filter(
      (job) =>
        job.company?._id === company?._id && job.isActive && !job.isDeleted,
    );
    if (jobs.length === 0) throw new Error('no active demo jobs were found');
    if (jobs.length > maxOperations)
      throw new Error(
        'active demo job count exceeds the bounded operation limit',
      );

    await indexing.initializeIndex();
    for (const job of jobs) await indexing.enqueue(job._id);
    const drained = await indexing.drain(maxOperations);
    if (
      drained.failed !== 0 ||
      drained.leaseLost !== 0 ||
      drained.completed !== jobs.length
    ) {
      throw new Error(
        `demo indexing did not reconcile all active jobs: ${JSON.stringify(
          drained,
        )}`,
      );
    }
    for (const job of jobs) {
      const sourceVersion = getJobSourceVersion(job, company);
      const outbox = await outboxRepo.findOne({
        where: {
          aggregateId: job._id,
          eventType: 'JOB_CHANGED',
          sourceVersion,
        },
      });
      if (!outbox || outbox.status !== 'COMPLETED')
        throw new Error(`outbox reconciliation failed for demo job ${job._id}`);
      if (outbox.attemptCount < 1 || outbox.aggregateId !== job._id) {
        throw new Error(
          `FastAPI indexing boundary did not record an attempt for demo job ${job._id}`,
        );
      }
    }
    // NestJS does not query Qdrant. Keep reviewed metadata evidence separate
    // from the FastAPI boundary response and never infer it from outbox success.
    verifyMetadataFile();
    process.stdout.write(
      JSON.stringify({
        initialized: true,
        reconciled: jobs.length,
        ...drained,
        collection: JOB_INDEX_COLLECTION,
        alias: JOB_INDEX_ALIAS,
        version: JOB_INDEX_VERSION,
      }) + '\n',
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});

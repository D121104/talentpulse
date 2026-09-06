import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { areQueueWorkersEnabled } from 'src/config/runtime-flags';
import { JobIndexOutbox } from './entities/job-index-outbox.entity';
import { JobIndexingProcessor } from './job-indexing.processor';
import { JobIndexingService } from './job-indexing.service';
import { JobIndexingSubscriber } from './job-indexing.subscriber';
import {
  CohereJobEmbeddingProvider,
  DeterministicJobEmbeddingProvider,
  FailClosedJobEmbeddingProvider,
  FailClosedJobVectorIndex,
  InMemoryJobVectorIndex,
  JobEmbeddingProvider,
  JobVectorIndex,
  QdrantJobVectorIndex,
} from './job-vector-index';

function createEmbeddingProvider(): JobEmbeddingProvider {
  const apiKey = String(process.env.COHERE_API_KEY ?? '').trim();
  if (apiKey) return new CohereJobEmbeddingProvider(apiKey);
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.JOB_INDEX_USE_DETERMINISTIC === 'true'
  ) {
    return new DeterministicJobEmbeddingProvider();
  }
  return new FailClosedJobEmbeddingProvider();
}

function createVectorIndex(): JobVectorIndex {
  const url = String(process.env.QDRANT_URL ?? '').trim();
  if (url) return new QdrantJobVectorIndex(url, process.env.QDRANT_API_KEY);
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.JOB_INDEX_USE_DETERMINISTIC === 'true'
  ) {
    return new InMemoryJobVectorIndex();
  }
  return new FailClosedJobVectorIndex();
}

@Module({
  imports: [TypeOrmModule.forFeature([JobIndexOutbox, Job, Company])],
  providers: [
    JobIndexingService,
    JobIndexingSubscriber,
    { provide: 'JOB_EMBEDDING_PROVIDER', useFactory: createEmbeddingProvider },
    { provide: 'JOB_VECTOR_INDEX', useFactory: createVectorIndex },
    ...(areQueueWorkersEnabled() ? [JobIndexingProcessor] : []),
  ],
  exports: [JobIndexingService],
})
export class JobIndexingModule {}

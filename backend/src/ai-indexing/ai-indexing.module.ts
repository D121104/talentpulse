import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiClientModule } from '../ai-client/ai-client.module';
import { Company } from '../companies/entities/company.entity';
import { Job } from '../jobs/entities/job.entity';
import { AiIndexDispatcherService } from './services/ai-index-dispatcher.service';
import { CanonicalJobProjectionService } from './services/canonical-job-projection.service';
import { AiIndexBackfillService } from './services/ai-index-backfill.service';
import { AiIndexReconcileService } from './services/ai-index-reconcile.service';
import { AiIndexReplayService } from './services/ai-index-replay.service';
import { AiIndexingService } from './ai-indexing.service';
import { AiIndexOutbox, AiJobIndexState, AiProviderAttempt } from './entities';

/**
 * Composition root for the transactional indexing outbox and its opt-in
 * dispatcher. The dispatcher is constructed with the API but only starts a
 * polling interval when RUN_INDEXING_WORKER=true (and background jobs remain
 * enabled).
 */
@Module({
  imports: [
    ConfigModule,
    AiClientModule,
    TypeOrmModule.forFeature([
      AiIndexOutbox,
      AiJobIndexState,
      AiProviderAttempt,
      Job,
      Company,
    ]),
  ],
  providers: [
    AiIndexingService,
    CanonicalJobProjectionService,
    AiIndexDispatcherService,
    AiIndexBackfillService,
    AiIndexReconcileService,
    AiIndexReplayService,
  ],
  exports: [
    AiIndexingService,
    CanonicalJobProjectionService,
    AiIndexDispatcherService,
    AiIndexBackfillService,
    AiIndexReconcileService,
    AiIndexReplayService,
    TypeOrmModule,
  ],
})
export class AiIndexingModule {}

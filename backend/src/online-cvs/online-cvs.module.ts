import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnlineCVsController } from './online-cvs.controller';
import { OnlineCVsService } from './online-cvs.service';
import { OnlineCV } from './entities/online-cv.entity';
import { User } from 'src/users/entities/user.entity';
import { FilesModule } from 'src/files/files.module';
import { UsersModule } from 'src/users/users.module';
import { RedisModule } from 'src/redis/redis.module';
import { AiCvConsentsModule } from 'src/ai-consents/ai-cv-consents.module';
import { AIMatchingModule } from 'src/ai-matching/ai-matching.module';
import { JobsModule } from 'src/jobs/jobs.module';
import { CandidateCareerProfileModule } from 'src/candidate-career-profile/candidate-career-profile.module';
import { BullModule } from '@nestjs/bull';
import {
  isRedisEnabled,
  areBackgroundJobsEnabled,
} from 'src/config/runtime-flags';
import { createNoopQueueProvider } from 'src/queues/queue-runtime';
import { ONLINE_CV_GENERATION_QUEUE } from './async-cv-generation.types';
import { OnlineCvGenerationProcessor } from './online-cv-generation.processor';

const redisEnabled = isRedisEnabled();
const backgroundJobsEnabled = areBackgroundJobsEnabled();

@Module({
  imports: [
    TypeOrmModule.forFeature([OnlineCV, User]),
    FilesModule,
    UsersModule,
    RedisModule,
    AiCvConsentsModule,
    AIMatchingModule,
    JobsModule,
    CandidateCareerProfileModule,
    ...(redisEnabled
      ? [BullModule.registerQueue({ name: ONLINE_CV_GENERATION_QUEUE })]
      : []),
  ],
  controllers: [OnlineCVsController],
  providers: [
    OnlineCVsService,
    ...(redisEnabled
      ? backgroundJobsEnabled
        ? [OnlineCvGenerationProcessor]
        : []
      : [createNoopQueueProvider(ONLINE_CV_GENERATION_QUEUE)]),
  ],
  exports: [OnlineCVsService],
})
export class OnlineCVsModule {}

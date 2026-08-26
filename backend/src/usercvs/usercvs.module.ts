import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { UserCV } from './entities/usercv.entity';
import { UserCVsService } from './usercvs.service';
import { UserCVsController } from './usercvs.controller';
import { AIMatchingModule } from 'src/ai-matching/ai-matching.module';
import { AiCvConsentsModule } from 'src/ai-consents/ai-cv-consents.module';
import { UserCvParseProcessor } from './cv-parse.processor';
import { areQueueWorkersEnabled } from 'src/config/runtime-flags';
import { createNoopQueueProvider } from 'src/queues/queue-runtime';

const queueWorkersEnabled = areQueueWorkersEnabled();

@Module({
  imports: [
    TypeOrmModule.forFeature([UserCV]),
    ...(queueWorkersEnabled
      ? [BullModule.registerQueue({ name: 'user-cv-parse' })]
      : []),
    AIMatchingModule,
    AiCvConsentsModule,
  ],
  controllers: [UserCVsController],
  providers: [
    UserCVsService,
    ...(queueWorkersEnabled
      ? [UserCvParseProcessor]
      : [createNoopQueueProvider('user-cv-parse')]),
  ],
  exports: [UserCVsService],
})
export class UserCVsModule {}

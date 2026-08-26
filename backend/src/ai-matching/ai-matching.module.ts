import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AIMatchingService } from './ai-matching.service';
import { CVProcessingService } from './cv-processing.service';
import { CVProcessingProcessor } from './cv-processing.processor';
import { CVMatchResult } from './entities/cv-match-result.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CVMatchResult]),
    BullModule.registerQueue({
      name: 'cv-processing',
    }),
  ],
  providers: [AIMatchingService, CVProcessingService, CVProcessingProcessor],
  exports: [AIMatchingService, CVProcessingService],
})
export class AIMatchingModule {}

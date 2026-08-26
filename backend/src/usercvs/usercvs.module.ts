import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { UserCV } from './entities/usercv.entity';
import { UserCVsService } from './usercvs.service';
import { UserCVsController } from './usercvs.controller';
import { AIMatchingModule } from 'src/ai-matching/ai-matching.module';
import { AiCvConsentsModule } from 'src/ai-consents/ai-cv-consents.module';
import { UserCvParseProcessor } from './cv-parse.processor';

const runBackgroundJobs = process.env.RUN_BACKGROUND_JOBS !== 'false';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserCV]),
    BullModule.registerQueue({ name: 'user-cv-parse' }),
    AIMatchingModule,
    AiCvConsentsModule,
  ],
  controllers: [UserCVsController],
  providers: [UserCVsService, ...(runBackgroundJobs ? [UserCvParseProcessor] : [])],
  exports: [UserCVsService],
})
export class UserCVsModule {}

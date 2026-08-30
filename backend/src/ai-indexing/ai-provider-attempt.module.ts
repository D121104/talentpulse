import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import {
  AiProviderAttemptIdFactoryToken,
  AiProviderAttemptNowFactoryToken,
  AiProviderAttemptRecorderToken,
} from '../ai-client/ai-provider-attempt.contracts';
import { AiProviderAttempt } from './entities/ai-provider-attempt.entity';
import { AiProviderAttemptRecorder } from './services/ai-provider-attempt-recorder.service';

@Module({
  imports: [TypeOrmModule.forFeature([AiProviderAttempt])],
  providers: [
    { provide: AiProviderAttemptIdFactoryToken, useValue: randomUUID },
    {
      provide: AiProviderAttemptNowFactoryToken,
      useValue: () => new Date(),
    },
    AiProviderAttemptRecorder,
    {
      provide: AiProviderAttemptRecorderToken,
      useExisting: AiProviderAttemptRecorder,
    },
  ],
  exports: [AiProviderAttemptRecorder, AiProviderAttemptRecorderToken],
})
export class AiProviderAttemptModule {}

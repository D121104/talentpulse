import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiCvConsent } from './entities/ai-cv-consent.entity';
import { AiCvConsentEvent } from './entities/ai-cv-consent-event.entity';
import { AiCvConsentsController } from './ai-cv-consents.controller';
import { AiCvConsentsService } from './ai-cv-consents.service';

@Module({
  imports: [TypeOrmModule.forFeature([AiCvConsent, AiCvConsentEvent])],
  controllers: [AiCvConsentsController],
  providers: [AiCvConsentsService],
  exports: [AiCvConsentsService],
})
export class AiCvConsentsModule {}

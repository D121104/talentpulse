import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiCandidateAssistantConsent } from './entities/ai-candidate-assistant-consent.entity';
import { AiCandidateAssistantConsentEvent } from './entities/ai-candidate-assistant-consent-event.entity';
import { CandidateAssistantConsentService } from './candidate-assistant-consent.service';
import { CandidateAssistantConsentController } from './candidate-assistant-consent.controller';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiCandidateAssistantConsent,
      AiCandidateAssistantConsentEvent,
    ]),
  ],
  controllers: [CandidateAssistantConsentController],
  providers: [CandidateAssistantConsentService],
  exports: [CandidateAssistantConsentService],
})
export class CandidateAssistantConsentModule {}

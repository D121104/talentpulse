import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandidateAssistantConsentModule } from './candidate-assistant-consent.module';
import { CandidateAssistantService } from './candidate-assistant.service';
import { CandidateAssistantQuotaService } from './candidate-assistant-quota.service';
import { CandidateAssistantController } from './candidate-assistant.controller';
import { AiChatSession } from './entities/ai-chat-session.entity';
import { AiChatMessage } from './entities/ai-chat-message.entity';
import { AiChatQuotaLedger } from './entities/ai-chat-quota-ledger.entity';
import { Company } from 'src/companies/entities/company.entity';
import { JobsModule } from 'src/jobs/jobs.module';
import { UserCVsModule } from 'src/usercvs/usercvs.module';
import { AIMatchingModule } from 'src/ai-matching/ai-matching.module';
import { UsersModule } from 'src/users/users.module';
import { CandidateAssistantAiServiceClient } from './candidate-assistant-ai.client';
import { CANDIDATE_ASSISTANT_AI_CLIENT } from './candidate-assistant.types';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiChatSession,
      AiChatMessage,
      AiChatQuotaLedger,
      Company,
    ]),
    CandidateAssistantConsentModule,
    JobsModule,
    UserCVsModule,
    AIMatchingModule,
    UsersModule,
  ],
  controllers: [CandidateAssistantController],
  providers: [
    CandidateAssistantService,
    CandidateAssistantQuotaService,
    CandidateAssistantAiServiceClient,
    {
      provide: CANDIDATE_ASSISTANT_AI_CLIENT,
      useExisting: CandidateAssistantAiServiceClient,
    },
  ],
  exports: [CandidateAssistantService, CANDIDATE_ASSISTANT_AI_CLIENT],
})
export class CandidateAssistantModule {}

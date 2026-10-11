import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandidateCareerProfile } from './entities/candidate-career-profile.entity';
import { CandidateCareerProfileController } from './candidate-career-profile.controller';
import { CandidateCareerProfileService } from './candidate-career-profile.service';

@Module({
  imports: [TypeOrmModule.forFeature([CandidateCareerProfile])],
  controllers: [CandidateCareerProfileController],
  providers: [CandidateCareerProfileService],
  exports: [CandidateCareerProfileService],
})
export class CandidateCareerProfileModule {}

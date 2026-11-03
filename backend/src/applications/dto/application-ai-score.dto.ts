import { CVProcessingStatus } from 'src/ai-matching/entities/cv-match-result.entity';

export interface ApplicationAiScoreSummary {
  status: CVProcessingStatus | 'MISSING' | 'STALE' | 'UNAVAILABLE';
  overallScore: number | null;
}

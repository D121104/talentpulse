import { IsIn, Matches } from 'class-validator';
import type { NarrativeStatement } from 'src/ai-matching/match-narrative';

export interface MatchAnalysisResponse {
  analysisVersionKey: string;
  locale: 'vi' | 'en';
  source: 'llm' | 'deterministic_fallback';
  fallbackReason:
    | null
    | 'provider_unavailable'
    | 'provider_timeout'
    | 'invalid_output';
  narrativeVersion: 'match-narrative-v1';
  analysis: {
    summary: NarrativeStatement;
    strengths: NarrativeStatement[];
    pointsToVerify: NarrativeStatement[];
  };
  evidenceLabels: Record<string, string>;
}

export class MatchAnalysisDto {
  @IsIn(['vi', 'en'])
  locale: 'vi' | 'en';

  @Matches(/^[a-f0-9]{64}$/)
  analysisVersionKey: string;
}

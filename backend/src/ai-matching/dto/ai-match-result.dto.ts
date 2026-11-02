export interface ICandidateMatchResult {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  candidateAvatar?: string;
  cvId: string;
  cvTitle: string;
  cvUrl: string;
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  shortExplanation: string;
  analysisAvailable: boolean;
  applicationStatus: string;
  appliedAt: string;
}

export interface IAIRankingResponse {
  jobId: string;
  jobName: string;
  totalApplications: number;
  rankedCandidates: ICandidateMatchResult[];
  processedAt: string;
  processingStatus?: {
    total: number;
    completed: number;
    processing: number;
    pending: number;
    failed: number;
  };
}

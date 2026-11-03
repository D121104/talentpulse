import { IsBoolean, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApplicationDto {
  @IsNotEmpty({ message: 'Vui lòng chọn CV!' })
  @IsUUID('4', { message: 'CV không hợp lệ' })
  cvId: string;

  @IsNotEmpty({ message: 'Vui lòng chọn công việc!' })
  @IsUUID('4', { message: 'Công việc không hợp lệ' })
  jobId: string;

  @IsNotEmpty({ message: 'Vui lòng chọn công ty!' })
  @IsUUID('4', { message: 'Công ty không hợp lệ' })
  companyId: string;

  @IsOptional()
  coverLetter?: string;

  @ApiPropertyOptional({
    deprecated: true,
    description:
      'Legacy field; ignored for new applications, including false. Submission authorizes AI analysis and ranking of the selected CV for this job only under application-ai-ranking-submission-v2, not an explicit checkbox grant. Withdrawing removes the application and its AI matching results and prevents further matching for that application. An AI request already in progress may finish, but its result will not be retained for the withdrawn application. No global CV search, other-job processing or AI training authorization is granted.',
  })
  @IsOptional()
  @IsBoolean()
  aiRankingConsent?: boolean;
}

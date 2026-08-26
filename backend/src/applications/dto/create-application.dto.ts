import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

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
}

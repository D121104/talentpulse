import { IsMongoId, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateApplicationDto {
  @IsNotEmpty({ message: 'Vui lòng chọn CV!' })
  @IsMongoId({ message: 'CV không hợp lệ' })
  cvId: string;

  @IsNotEmpty({ message: 'Vui lòng chọn công việc!' })
  @IsMongoId({ message: 'Công việc không hợp lệ' })
  jobId: string;

  @IsNotEmpty({ message: 'Vui lòng chọn công ty!' })
  @IsMongoId({ message: 'Công ty không hợp lệ' })
  companyId: string;

  @IsOptional()
  coverLetter?: string;
}

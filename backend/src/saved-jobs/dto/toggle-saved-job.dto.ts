import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ToggleSavedJobDto {
  @ApiProperty({ description: 'UUID of the Job to save or unsave' })
  @IsNotEmpty({ message: 'jobId không được để trống' })
  @IsUUID('4', { message: 'jobId phải là định dạng UUID hợp lệ' })
  jobId: string;
}

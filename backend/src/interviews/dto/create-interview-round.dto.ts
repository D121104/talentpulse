import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  Min,
} from 'class-validator';
import { InterviewRoundType } from '../entities/interview-round.entity';

export class CreateInterviewRoundDto {
  @IsNotEmpty({ message: 'applicationId không được để trống' })
  @IsUUID('4', { message: 'applicationId phải là UUID hợp lệ' })
  applicationId: string;

  @IsNotEmpty({ message: 'Tiêu đề vòng phỏng vấn không được để trống' })
  @IsString({ message: 'Tiêu đề phải là chuỗi' })
  title: string;

  @IsOptional()
  @IsEnum(InterviewRoundType, { message: 'Loại vòng phỏng vấn không hợp lệ' })
  roundType?: InterviewRoundType = InterviewRoundType.TECHNICAL;

  @IsOptional()
  @IsNumber({}, { message: 'Số thứ tự vòng phải là số' })
  @Min(1, { message: 'Số thứ tự vòng tối thiểu là 1' })
  roundNumber?: number = 1;

  @IsNotEmpty({ message: 'Thời gian bắt đầu không được để trống' })
  @IsDateString({}, { message: 'Thời gian bắt đầu phải là định dạng ISO 8601' })
  scheduledAt: string;

  @IsNotEmpty({ message: 'Thời gian kết thúc không được để trống' })
  @IsDateString({}, { message: 'Thời gian kết thúc phải là định dạng ISO 8601' })
  scheduledEndAt: string;

  @IsOptional()
  @IsBoolean({ message: 'isOnline phải là boolean' })
  isOnline?: boolean = true;

  @IsOptional()
  @IsString({ message: 'Địa điểm phải là chuỗi' })
  location?: string;

  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi' })
  notes?: string;

  @IsOptional()
  @IsArray({ message: 'Danh sách người phỏng vấn phải là mảng' })
  @IsUUID('4', { each: true, message: 'ID người phỏng vấn phải là UUID' })
  interviewerIds?: string[];

  @IsOptional()
  @IsBoolean({ message: 'sendEmailInvite phải là boolean' })
  sendEmailInvite?: boolean = true;
}

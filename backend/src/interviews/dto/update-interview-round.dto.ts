import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';
import {
  InterviewResult,
  InterviewRoundStatus,
  InterviewRoundType,
} from '../entities/interview-round.entity';

export class UpdateInterviewRoundDto {
  @IsOptional()
  @IsString({ message: 'Tiêu đề phải là chuỗi' })
  title?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Thời gian bắt đầu phải là định dạng ISO 8601' })
  scheduledAt?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Thời gian kết thúc phải là định dạng ISO 8601' })
  scheduledEndAt?: string;

  @IsOptional()
  @IsEnum(InterviewRoundType, { message: 'Loại vòng phỏng vấn không hợp lệ' })
  roundType?: InterviewRoundType;

  @IsOptional()
  @IsEnum(InterviewRoundStatus, { message: 'Trạng thái không hợp lệ' })
  status?: InterviewRoundStatus;

  @IsOptional()
  @IsEnum(InterviewResult, { message: 'Kết quả không hợp lệ' })
  result?: InterviewResult;

  @IsOptional()
  @IsString({ message: 'Địa điểm phải là chuỗi' })
  location?: string;

  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi' })
  notes?: string;

  @IsOptional()
  @IsString({ message: 'Đánh giá người phỏng vấn phải là chuỗi' })
  interviewerFeedback?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Điểm đánh giá phải là số' })
  @Min(0, { message: 'Điểm tối thiểu là 0' })
  @Max(100, { message: 'Điểm tối đa là 100' })
  score?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Phiên bản không hợp lệ' })
  expectedVersion?: number;
}

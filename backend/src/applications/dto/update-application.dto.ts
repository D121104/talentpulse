import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { ApplicationStatus } from '../entities/application.entity';

export class UpdateApplicationStatusDto {
  @IsNotEmpty({ message: 'Trạng thái không được để trống' })
  @IsEnum(ApplicationStatus, { message: 'Trạng thái không hợp lệ' })
  status: ApplicationStatus;

  @IsOptional()
  @IsNumber({}, { message: 'Phiên bản không hợp lệ' })
  expectedVersion?: number;

  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi' })
  note?: string;

  @IsOptional()
  @IsString({ message: 'Lý do phải là chuỗi' })
  reason?: string;

  @IsOptional()
  @IsBoolean({ message: 'Tuỳ chọn gửi email phải là giá trị boolean' })
  sendEmail?: boolean;

  @IsOptional()
  @IsString({ message: 'Tiêu đề email phải là chuỗi' })
  customEmailSubject?: string;

  @IsOptional()
  @IsString({ message: 'Nội dung email phải là chuỗi' })
  customEmailContent?: string;
}

export class WithdrawApplicationDto {
  @IsOptional()
  @IsString({ message: 'Lý do rút đơn phải là chuỗi' })
  reason?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Phiên bản không hợp lệ' })
  expectedVersion?: number;
}

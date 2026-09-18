import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ConfirmInterviewDto {
  @IsNotEmpty({ message: 'Hành động xác nhận không được để trống' })
  @IsIn(['CONFIRM', 'DECLINE'], {
    message: 'Hành động phải là CONFIRM (Đồng ý) hoặc DECLINE (Từ chối)',
  })
  action: 'CONFIRM' | 'DECLINE';

  @IsOptional()
  @IsString({ message: 'Phản hồi phải là chuỗi' })
  feedback?: string;
}

export class SendInterviewInviteDto {
  @IsOptional()
  @IsString({ message: 'Tin nhắn gửi kèm phải là chuỗi' })
  customMessage?: string;
}

export class InterviewFilterDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  applicationId?: string;
}

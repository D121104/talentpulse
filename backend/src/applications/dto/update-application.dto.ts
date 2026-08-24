import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApplicationStatus } from '../entities/application.entity';

export class UpdateApplicationStatusDto {
  @IsNotEmpty({ message: 'Trạng thái không được để trống!' })
  @IsEnum(ApplicationStatus, { message: 'Trạng thái không hợp lệ' })
  status: ApplicationStatus;
}

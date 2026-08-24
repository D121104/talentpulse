import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleExchangeDto {
  @IsString()
  @IsNotEmpty({ message: 'Mã xác thực Google không hợp lệ' })
  code: string;
}

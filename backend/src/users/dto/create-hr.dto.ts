import { IsNotEmpty, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class CreateHrDto extends CreateUserDto {
  role: 'HR';

  @IsOptional()
  companyName?: string;

  @IsOptional()
  taxCode?: string;

  @IsOptional()
  companyScale?: string;
}

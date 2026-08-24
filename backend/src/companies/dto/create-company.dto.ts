import { IsNotEmpty, IsOptional } from 'class-validator';

export class CreateCompanyDto {
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @IsOptional()
  description?: string;

  @IsOptional()
  address?: string;

  @IsOptional()
  logo?: string;

  @IsOptional()
  taxCode?: string;

  @IsOptional()
  scale?: string;

  @IsOptional()
  isActive?: boolean;
}

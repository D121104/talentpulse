import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Role } from 'src/decorator/customize';

class Company {
  @IsOptional()
  _id: string;

  @IsOptional()
  name: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  email?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  name?: string;

  @IsOptional()
  age?: number;

  @IsOptional()
  gender?: string;

  @IsOptional()
  address?: string;

  @IsOptional()
  avatar?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => Company)
  company?: Company;
}

export class UpdateUserPasswordDto {
  @ValidateIf((dto) => !dto.currentPassword)
  @IsString()
  @IsNotEmpty({ message: 'Current password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  oldPassword?: string;

  @ValidateIf((dto) => !dto.oldPassword)
  @IsString()
  @IsNotEmpty({ message: 'Current password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  currentPassword?: string;

  @ValidateIf((dto) => !dto.password)
  @IsString()
  @IsNotEmpty({ message: 'New password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  newPassword?: string;

  // Kept for compatibility with the existing frontend request payload.
  @ValidateIf((dto) => !dto.newPassword)
  @IsString()
  @IsNotEmpty({ message: 'New password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  password?: string;
}

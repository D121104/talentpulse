import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Role } from 'src/decorator/customize';

export class Company {
  @IsNotEmpty()
  _id: string;

  @IsOptional()
  name: string;

  @IsOptional()
  logo?: string;

  @IsOptional()
  isActive?: boolean;
}

export class RegisterUserDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'The email of the user',
  })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email cannot be empty' })
  email: string;

  @ApiProperty({
    example: 'password123',
    description: 'The password of the user',
  })
  @IsNotEmpty({ message: 'Password cannot be empty' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'The name of the user',
  })
  @IsNotEmpty({ message: 'Name cannot be empty' })
  name: string;

  @ApiProperty({
    example: 30,
    description: 'The age of the user',
  })
  @IsOptional()
  age?: number;

  @ApiProperty({
    example: 'male',
    description: 'The gender of the user',
  })
  @IsOptional()
  gender?: string;

  @ApiProperty({
    example: 'Ha Noi',
    description: 'The address of the user',
  })
  @IsOptional()
  address?: string;

  @ApiProperty({
    example: 'USER',
    description: 'The role of the user',
    enum: Role,
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiProperty({
    example: {
      _id: '60d0fe4f5311236168a109ca',
      name: 'Glints',
    },
    description: 'The company of the user',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => Company)
  company?: Company;
}

export class CreateUserDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'The email of the user',
  })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email cannot be empty' })
  email: string;

  @ApiProperty({
    example: 'password123',
    description: 'The password of the user',
  })
  @IsNotEmpty({ message: 'Password cannot be empty' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'The name of the user',
  })
  @IsNotEmpty({ message: 'Name cannot be empty' })
  name: string;

  @ApiProperty({
    example: 30,
    description: 'The age of the user',
  })
  @IsOptional()
  age?: number;

  @ApiProperty({
    example: 'male',
    description: 'The gender of the user',
  })
  @IsOptional()
  gender?: string;

  @ApiProperty({
    example: '123 Main St',
    description: 'The address of the user',
  })
  @IsOptional()
  address?: string;
}

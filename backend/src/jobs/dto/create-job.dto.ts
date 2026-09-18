import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsNotEmpty,
  IsNotEmptyObject,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Company } from 'src/users/dto/create-user.dto';

export class CreateJobDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  description: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  skills: string[];

  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => Company)
  company: Company;

  @IsNumber()
  @IsNotEmpty()
  salary: number;

  @IsNotEmpty()
  level: string;

  @IsString()
  @IsOptional()
  workingModel?: string;

  @IsString()
  @IsOptional()
  education?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  benefits?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categories?: string[];

  @IsDate()
  @Transform(({ value }) => new Date(value))
  @IsNotEmpty()
  startDate: Date;

  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @IsNotEmpty()
  location: string;

  @Transform(({ value }) => new Date(value))
  @IsNotEmpty()
  endDate: Date;

  @IsBoolean()
  @IsNotEmpty()
  isActive: boolean;

  @IsBoolean()
  @IsOptional()
  isHot?: boolean;

  @IsDate()
  @IsOptional()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  boostedAt?: Date;
}

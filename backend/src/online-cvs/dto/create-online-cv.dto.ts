import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OnlineCvGenerationMode } from '../entities/online-cv.entity';

export class EducationEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  schoolName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  major?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class WorkExperienceEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class SkillEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class ActivityEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CertificateEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  date?: string;
}

export class AwardEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  date?: string;
}

export class ProjectEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  technologies?: string[];
}

export class CreateOnlineCVDto {
  @ApiProperty({ enum: ['template1', 'template2'] })
  @IsNotEmpty()
  @IsEnum(['template1', 'template2'])
  templateType: string;

  @ApiPropertyOptional({ enum: ['vi-VN', 'en-US'], default: 'vi-VN' })
  @IsOptional()
  @IsIn(['vi-VN', 'en-US'])
  locale?: 'vi-VN' | 'en-US';

  @ApiPropertyOptional({
    enum: OnlineCvGenerationMode,
    default: OnlineCvGenerationMode.MANUAL,
  })
  @IsOptional()
  @IsEnum(OnlineCvGenerationMode)
  generationMode?: OnlineCvGenerationMode;

  @ApiPropertyOptional({
    description: 'Tên / Tiêu đề của CV (vd: CV - Senior Developer)',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  link?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  careerObjective?: string;

  @ApiPropertyOptional({ type: [EducationEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EducationEntryDto)
  education?: EducationEntryDto[];

  @ApiPropertyOptional({ type: [WorkExperienceEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkExperienceEntryDto)
  workExperience?: WorkExperienceEntryDto[];

  @ApiPropertyOptional({ type: [SkillEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillEntryDto)
  skills?: SkillEntryDto[];

  @ApiPropertyOptional({ type: [ActivityEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActivityEntryDto)
  activities?: ActivityEntryDto[];

  @ApiPropertyOptional({ type: [CertificateEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CertificateEntryDto)
  certificates?: CertificateEntryDto[];

  @ApiPropertyOptional({ type: [AwardEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AwardEntryDto)
  awards?: AwardEntryDto[];

  @ApiPropertyOptional({ type: [ProjectEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectEntryDto)
  projects?: ProjectEntryDto[];

  @ApiPropertyOptional({
    type: [String],
    example: ['objective', 'skills', 'experience', 'education'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sectionOrder?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fontFamily?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  themeColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fontSize?: string;

  @ApiPropertyOptional()
  @IsOptional()
  customFormatting?: any;

  @ApiPropertyOptional({
    description: 'HTML snapshot of CV canvas for pixel-perfect PDF export',
  })
  @IsOptional()
  @IsString()
  htmlContent?: string;

  @ApiPropertyOptional({
    description: 'Cho phép Nhà Tuyển Dụng tìm kiếm CV này',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isSearchable?: boolean;

  @ApiPropertyOptional({ description: 'Đặt làm CV chính', default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

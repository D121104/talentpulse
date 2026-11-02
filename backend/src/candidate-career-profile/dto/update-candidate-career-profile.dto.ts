import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  Length,
  Matches,
  Max,
  MaxLength,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const MAX_PROFILE_TEXT_LENGTH = 4_000;
const MAX_PROFILE_ITEMS = 50;
const MAX_PROFILE_TOTAL_ITEMS = 350;
const MAX_PROFILE_TOTAL_TEXT_LENGTH = 200_000;

@ValidatorConstraint({ name: 'profileAggregateLimit', async: false })
class ProfileAggregateLimitConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const profile = args.object as Record<string, unknown>;
    let itemCount = 0;
    let textLength = 0;
    const visit = (value: unknown): void => {
      if (typeof value === 'string') {
        textLength += value.length;
      } else if (Array.isArray(value)) {
        itemCount += value.length;
        value.forEach(visit);
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(visit);
      }
    };
    visit(profile);
    return (
      itemCount <= MAX_PROFILE_TOTAL_ITEMS &&
      textLength <= MAX_PROFILE_TOTAL_TEXT_LENGTH
    );
  }

  defaultMessage(): string {
    return 'Hồ sơ nghề nghiệp vượt quá giới hạn tổng dữ liệu cho phép';
  }
}

export class CandidateCareerContactDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  link?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  avatar?: string;
}

export class CandidateCareerExperienceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  description?: string;
}

export class CandidateCareerEducationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  schoolName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  degree?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  major?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  description?: string;
}

export class CandidateCareerProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  projectName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  description?: string;

  @ApiPropertyOptional({ description: 'Comma-separated technologies' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  technologies?: string;
}

export class CandidateCareerSkillDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  level?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  description?: string;
}

export class CandidateCareerActivityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  organizationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  description?: string;
}

export class CandidateCareerCertificateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  issuer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  credentialUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  date?: string;
}

export class CandidateCareerAwardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  issuer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  date?: string;
}

export class UpdateCandidateCareerProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  link?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  avatar?: string;

  @ApiPropertyOptional({ type: CandidateCareerContactDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CandidateCareerContactDto)
  contact?: CandidateCareerContactDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  headline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  objective?: string;

  /** Compatibility with the existing OnlineCV field name. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROFILE_TEXT_LENGTH)
  careerObjective?: string;

  @ApiPropertyOptional({ type: [CandidateCareerExperienceDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PROFILE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CandidateCareerExperienceDto)
  experience?: CandidateCareerExperienceDto[];

  @ApiPropertyOptional({ type: [CandidateCareerEducationDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PROFILE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CandidateCareerEducationDto)
  education?: CandidateCareerEducationDto[];

  @ApiPropertyOptional({ type: [CandidateCareerProjectDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PROFILE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CandidateCareerProjectDto)
  projects?: CandidateCareerProjectDto[];

  @ApiPropertyOptional({ type: [CandidateCareerCertificateDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PROFILE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CandidateCareerCertificateDto)
  certificates?: CandidateCareerCertificateDto[];

  @ApiPropertyOptional({ type: [CandidateCareerSkillDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PROFILE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CandidateCareerSkillDto)
  skills?: CandidateCareerSkillDto[];

  @ApiPropertyOptional({ type: [CandidateCareerActivityDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PROFILE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CandidateCareerActivityDto)
  activities?: CandidateCareerActivityDto[];

  @ApiPropertyOptional({ type: [CandidateCareerAwardDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PROFILE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CandidateCareerAwardDto)
  awards?: CandidateCareerAwardDto[];

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Version read by the client',
  })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  @Validate(ProfileAggregateLimitConstraint)
  contentVersion: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedProfileVersion?: number;
}

export class GenerateFromCareerProfileDto {
  @ApiPropertyOptional({
    enum: ['template1', 'template2'],
    default: 'template1',
  })
  @IsOptional()
  @IsEnum(['template1', 'template2'])
  templateType?: 'template1' | 'template2';

  @ApiPropertyOptional({
    description: 'Locale used for the generated CV text',
    default: 'vi-VN',
    example: 'vi-VN',
  })
  @IsOptional()
  @IsString()
  @Length(2, 16)
  @Matches(/^[A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?$/)
  @IsIn(['vi-VN', 'en-US'])
  locale?: 'vi-VN' | 'en-US';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  jobId?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedProfileVersion?: number;
}

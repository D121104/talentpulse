import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  IsString,
  Matches,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CvRegenerationTargetDto {
  @IsUUID()
  reviewOperationId: string;

  @IsString()
  @Length(64, 64)
  @Matches(/^[a-f0-9]{64}$/i)
  expectedDraftHash: string;

  @IsString()
  @Matches(
    /^\/(?:position|career_objective|(?:education|work_experience|projects|skills|activities|certificates|awards)\/(?:0|[1-9]\d*))$/,
  )
  targetPath: string;
}

/** Input for the authenticated candidate's existing editable CV. */
export class GenerateOnlineCvDto {
  @ApiPropertyOptional({
    description: 'Optional active canonical job to tailor the CV to',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  jobId?: string;
}

/** Input for an asynchronous generation operation. */
export class EnqueueOnlineCvGenerationDto extends GenerateOnlineCvDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedContentVersion: number;

  @IsOptional()
  @IsString()
  @Length(64, 64)
  sourceVersion?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CvRegenerationTargetDto)
  regenerationTarget?: CvRegenerationTargetDto;
}

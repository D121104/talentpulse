import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsUUID,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

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
}

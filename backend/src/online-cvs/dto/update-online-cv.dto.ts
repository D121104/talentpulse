import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CreateOnlineCVDto } from './create-online-cv.dto';
import {
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  Matches,
  ValidateNested,
} from 'class-validator';

export class GenerationApprovalDto {
  @IsUUID()
  operationId: string;

  @Matches(/^[a-f0-9]{64}$/)
  draftHash: string;
}

export class UpdateOnlineCVDto extends PartialType(CreateOnlineCVDto) {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedContentVersion: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => GenerationApprovalDto)
  generationApproval?: GenerationApprovalDto;
}

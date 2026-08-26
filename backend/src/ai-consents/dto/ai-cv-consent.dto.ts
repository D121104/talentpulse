import {
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
} from 'class-validator';

export class GrantAiCvConsentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  scope: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  consentVersion: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  policyHash: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  source: string;

  @IsObject()
  sourceMetadata: Record<string, string>;
}

export class RevokeAiCvConsentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  scope: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  consentVersion: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  policyHash: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  source: string;

  @IsObject()
  sourceMetadata: Record<string, string>;
}

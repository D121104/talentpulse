import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsObject,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { AiCvConsentScope } from '../ai-cv-consent.policy';

function IsStringRecord(validationOptions?: ValidationOptions) {
  return (target: object, propertyKey: string) => {
    registerDecorator({
      name: 'isStringRecord',
      target: target.constructor,
      propertyName: propertyKey,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return false;
          }
          const entries = Object.entries(value as Record<string, unknown>);
          return (
            entries.length <= 20 &&
            entries.every(
              ([key, entryValue]) =>
                key.length > 0 &&
                key.length <= 80 &&
                typeof entryValue === 'string' &&
                entryValue.length <= 200,
            )
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must contain at most 20 string values with keys up to 80 and values up to 200 characters`;
        },
      },
    });
  };
}

export class GrantAiCvConsentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @IsEnum(AiCvConsentScope)
  scope: AiCvConsentScope;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\w[\w.-]{0,79}$/)
  @MaxLength(80)
  consentVersion: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  @MaxLength(128)
  policyHash: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  source: string;

  @IsOptional()
  @IsObject()
  @IsStringRecord()
  sourceMetadata?: Record<string, string>;
}

export class RevokeAiCvConsentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @IsEnum(AiCvConsentScope)
  scope: AiCvConsentScope;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\w[\w.-]{0,79}$/)
  @MaxLength(80)
  consentVersion: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  @MaxLength(128)
  policyHash: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  source: string;

  @IsOptional()
  @IsObject()
  @IsStringRecord()
  sourceMetadata?: Record<string, string>;
}

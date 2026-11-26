import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  registerDecorator,
} from 'class-validator';

function IsStringRecord() {
  return (target: object, propertyKey: string) =>
    registerDecorator({
      name: 'isCandidateAssistantStringRecord',
      target: target.constructor,
      propertyName: propertyKey,
      validator: {
        validate(value: unknown) {
          if (
            typeof value !== 'object' ||
            value === null ||
            Array.isArray(value)
          )
            return false;
          const entries = Object.entries(value as Record<string, unknown>);
          return (
            entries.length <= 20 &&
            entries.every(
              ([key, entry]) =>
                key.length > 0 &&
                key.length <= 80 &&
                typeof entry === 'string' &&
                entry.length <= 200,
            )
          );
        },
      },
    });
}

export class GrantCandidateAssistantConsentDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\w[\w.-]{0,79}$/)
  @MaxLength(80)
  consentVersion: string;
  @IsString()
  @IsNotEmpty()
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

export class RevokeCandidateAssistantConsentDto extends GrantCandidateAssistantConsentDto {}

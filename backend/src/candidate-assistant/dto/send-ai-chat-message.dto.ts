import { Type } from 'class-transformer';
import { AI_LOCALE_PATTERN } from '../candidate-assistant.types';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendAiChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content: string;

  @IsUUID('4')
  clientMessageId: string;

  /** Optional BCP-47-like locale; legacy clients default to English. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(16)
  @Matches(AI_LOCALE_PATTERN)
  locale?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  jobIds?: string[];

  @IsOptional()
  @IsUUID('4')
  cvId?: string;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}

export class ListAiChatMessagesDto {
  @IsOptional()
  @Type(() => Number)
  limit = 30;

  @IsOptional()
  @IsISO8601()
  before?: string;
}

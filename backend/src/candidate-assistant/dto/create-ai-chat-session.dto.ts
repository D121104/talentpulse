import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AiChatSessionMode } from '../candidate-assistant.types';
export class CreateAiChatSessionDto {
  @IsEnum(AiChatSessionMode) mode: AiChatSessionMode;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) title?: string;
}

import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
} from 'class-validator';
import { ChatMessageType } from '../entities/chat-message.entity';

export class CreateMessageDto {
  @IsNotEmpty({ message: 'Nội dung tin nhắn không được để trống' })
  @IsString()
  content: string;

  @IsOptional()
  @IsEnum(ChatMessageType)
  messageType?: ChatMessageType;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsNumber()
  fileSize?: number;
}

import { IsOptional, IsUUID } from 'class-validator';

export class StartConversationDto {
  @IsOptional()
  @IsUUID('4', { message: 'companyId phải là định dạng UUID hợp lệ' })
  companyId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'candidateId phải là định dạng UUID hợp lệ' })
  candidateId?: string;
}

export class AddReactionDto {
  @IsUUID('4', { message: 'messageId phải là định dạng UUID hợp lệ' })
  messageId: string;

  @IsOptional()
  emoji: string;
}

import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  AiChatMessageRole,
  AiChatMessageStatus,
} from '../candidate-assistant.types';

@Entity('ai_chat_messages')
@Check('CHK_ai_chat_messages_role', `"role" IN ('USER', 'ASSISTANT')`)
@Check(
  'CHK_ai_chat_messages_status',
  "\"status\" IN ('PROCESSING', 'COMPLETED', 'FAILED')",
)
@Check(
  'CHK_ai_chat_messages_user_content',
  `"role" <> 'USER' OR ("content" IS NOT NULL AND length(btrim("content")) > 0)`,
)
@Check(
  'CHK_ai_chat_messages_parent_not_self',
  '"parentMessageId" IS NULL OR "parentMessageId" <> "_id"',
)
@Check(
  'CHK_ai_chat_messages_client_id_role',
  `("role" = 'USER' AND "clientMessageId" IS NOT NULL) OR ("role" = 'ASSISTANT' AND "clientMessageId" IS NULL)`,
)
@Check(
  'CHK_ai_chat_messages_failed_error',
  `"status" <> 'FAILED' OR "errorCode" IS NOT NULL`,
)
@Index('UQ_ai_chat_messages_session_id', ['sessionId', '_id'], {
  unique: true,
})
@Index('UQ_ai_chat_messages_client_id', ['sessionId', 'clientMessageId'], {
  unique: true,
  where: '"clientMessageId" IS NOT NULL',
})
@Index('IDX_ai_chat_messages_session_created', ['sessionId', 'createdAt'])
export class AiChatMessage {
  @PrimaryGeneratedColumn('uuid') _id: string;
  @Column({ type: 'uuid' }) sessionId: string;
  @Column({ type: 'uuid', nullable: true }) parentMessageId: string | null;
  @Column({ type: 'varchar', length: 16 }) role: AiChatMessageRole;
  @Column({
    type: 'varchar',
    length: 24,
    default: AiChatMessageStatus.COMPLETED,
  })
  status: AiChatMessageStatus;
  @Column({ type: 'text', nullable: true }) content: string | null;
  @Column({ type: 'varchar', length: 160, nullable: true }) clientMessageId:
    | string
    | null;
  @Column({ type: 'jsonb', nullable: true }) blocks: unknown[] | null;
  @Column({ type: 'jsonb', nullable: true }) citations: unknown[] | null;
  @Column({ type: 'jsonb', nullable: true }) filterState: Record<
    string,
    unknown
  > | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) errorCode:
    | string
    | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

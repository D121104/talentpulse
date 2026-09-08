import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AiChatSessionMode } from '../candidate-assistant.types';

@Entity('ai_chat_sessions')
@Check(
  'CHK_ai_chat_sessions_mode',
  `"mode" IN ('JOB_SEARCH', 'CV_ANALYSIS', 'CV_JOB_COMPARISON', 'ADVICE')`,
)
@Index('IDX_ai_chat_sessions_user_updated', ['userId', 'updatedAt'])
export class AiChatSession {
  @PrimaryGeneratedColumn('uuid') _id: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'varchar', length: 32 }) mode: AiChatSessionMode;
  @Column({ type: 'varchar', length: 160, nullable: true }) title:
    | string
    | null;
  @Column({ type: 'timestamptz', nullable: true }) archivedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

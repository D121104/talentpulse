import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AiQuotaReservationStatus } from '../candidate-assistant.types';

@Entity('ai_chat_quota_ledger')
@Check(
  'CHK_ai_chat_quota_status',
  '"status" IN (\'RESERVED\', \'COMMITTED\', \'RELEASED\')',
)
@Check(
  'CHK_ai_chat_quota_reservation_state',
  '("status" = \'RESERVED\' AND "finalizedAt" IS NULL AND "errorCode" IS NULL AND "messageId" IS NULL) OR ("status" = \'COMMITTED\' AND "finalizedAt" IS NOT NULL AND "errorCode" IS NULL AND "messageId" IS NOT NULL) OR ("status" = \'RELEASED\' AND "finalizedAt" IS NOT NULL AND "errorCode" IS NOT NULL AND "messageId" IS NULL)',
)
@Index(
  'UQ_ai_chat_quota_reservation',
  ['userId', 'quotaDate', 'reservationKey'],
  { unique: true },
)
@Index('IDX_ai_chat_quota_user_date_status', ['userId', 'quotaDate', 'status'])
@Index('IDX_ai_chat_quota_message', ['messageId'], {
  where: '"messageId" IS NOT NULL',
})
export class AiChatQuotaLedger {
  @PrimaryGeneratedColumn('uuid') _id: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'date' }) quotaDate: string;
  @Column({ type: 'varchar', length: 160 }) reservationKey: string;
  @Column({ type: 'uuid', nullable: true }) messageId: string | null;
  @Column({ type: 'varchar', length: 16 }) status: AiQuotaReservationStatus;
  @Column({ type: 'varchar', length: 64, nullable: true }) errorCode:
    | string
    | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) finalizedAt: Date | null;
}

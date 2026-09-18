import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { InterviewRound } from './interview-round.entity';

export enum ParticipantRole {
  INTERVIEWER = 'INTERVIEWER',
  CANDIDATE = 'CANDIDATE',
  OBSERVER = 'OBSERVER',
}

@Entity('interview_participants')
@Index(['roundId', 'userId'])
export class InterviewParticipant {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column({ type: 'uuid' })
  roundId: string;

  @ManyToOne(() => InterviewRound, (r) => r.participants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'roundId' })
  round: InterviewRound;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'varchar',
    length: 50,
    default: ParticipantRole.INTERVIEWER,
  })
  role: ParticipantRole;

  @Column({ type: 'timestamptz', nullable: true })
  joinedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  leftAt?: Date;

  @Column({ type: 'text', nullable: true })
  feedback?: string;

  @Column({ type: 'int', nullable: true })
  rating?: number;

  @Column({ default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

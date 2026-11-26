import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Company } from 'src/companies/entities/company.entity';
import { ChatMessage } from './chat-message.entity';

@Entity('chat_conversations')
@Unique(['candidateId', 'companyId'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column({ type: 'uuid' })
  @Index()
  candidateId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'candidateId' })
  candidate: User;

  @Column({ type: 'uuid' })
  @Index()
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column({ type: 'text', nullable: true })
  lastMessageText: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  @Index()
  lastMessageAt: Date;

  @Column({ type: 'uuid', nullable: true })
  lastSenderId: string;

  @Column({ type: 'int', default: 0 })
  candidateUnreadCount: number;

  @Column({ type: 'int', default: 0 })
  companyUnreadCount: number;

  @OneToMany(() => ChatMessage, (message) => message.conversation)
  messages: ChatMessage[];

  @Column({ default: false })
  isDeleted: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp with time zone', nullable: true })
  deletedAt: Date;
}

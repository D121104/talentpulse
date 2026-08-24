import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Entity('user_cvs')
export class UserCV {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column()
  url: string;

  @Column({ nullable: true })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'uuid', nullable: true })
  onlineCvId: string;

  @Column({ default: 'pdf' })
  fileType: string;

  @Column({ type: 'text', nullable: true })
  parsedText: string;

  @Column({ type: 'text', array: true, default: '{}' })
  skills: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  education: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  experience: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  certificates: string[];

  @Column({ default: false })
  isPrimary: boolean;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ default: false })
  isDeleted: boolean;

  @Column({ type: 'jsonb', nullable: true })
  createdBy: {
    _id: string;
    email: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  updatedBy: {
    _id: string;
    email: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  deletedBy: {
    _id: string;
    email: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date;
}

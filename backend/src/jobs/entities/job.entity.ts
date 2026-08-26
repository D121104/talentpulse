import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', array: true, default: '{}' })
  skills: string[];

  @Column({ type: 'jsonb' })
  company: {
    _id: string;
    name: string;
    logo?: string;
    isActive?: boolean;
  };

  @Column({ type: 'numeric', nullable: true })
  salary: number;

  @Column({ nullable: true })
  level: string;

  @Column({ type: 'timestamptz', nullable: true })
  startDate: Date;

  @Column({ type: 'int', nullable: true })
  quantity: number;

  @Column({ nullable: true })
  location: string;

  @Column({ type: 'timestamptz', nullable: true })
  endDate: Date;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isHot: boolean;

  @Column({ type: 'timestamp', nullable: true })
  boostedAt: Date;

  @Column({ default: false })
  isFeatured: boolean;

  @Column({ default: false })
  isUrgent: boolean;

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

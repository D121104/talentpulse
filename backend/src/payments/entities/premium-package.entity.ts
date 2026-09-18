import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { PremiumPlan } from '../../users/entities/user.entity';
import { PaymentBillingCycle } from './payment-order.entity';

@Entity('premium_packages')
@Index(['planType', 'billingCycle'])
@Index(['code'], { unique: true })
export class PremiumPackage {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  code: string;

  @Column({
    name: 'plan_type',
    type: 'enum',
    enum: PremiumPlan,
  })
  planType: PremiumPlan;

  @Column({
    name: 'billing_cycle',
    type: 'enum',
    enum: PaymentBillingCycle,
  })
  billingCycle: PaymentBillingCycle;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 0,
    transformer: {
      to: (val?: number | null) => val,
      from: (val?: string | number | null) => (val != null ? Number(val) : 0),
    },
  })
  price: number;

  @Column({
    name: 'original_price',
    type: 'decimal',
    precision: 12,
    scale: 0,
    nullable: true,
    transformer: {
      to: (val?: number | null) => val,
      from: (val?: string | number | null) =>
        val != null ? Number(val) : null,
    },
  })
  originalPrice: number | null;

  @Column({ name: 'duration_days', type: 'int', default: 30 })
  durationDays: number;

  @Column({ name: 'ai_quota', type: 'int', default: 50 })
  aiQuota: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  badge: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  features: string[];

  @Column({ name: 'hot_job_limit', type: 'int', default: 0 })
  hotJobLimit: number;

  @Column({ name: 'candidate_search_limit', type: 'int', default: 0 })
  candidateSearchLimit: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @Column({ type: 'jsonb', nullable: true })
  createdBy: {
    _id: string;
    email: string;
  } | null;

  @Column({ type: 'jsonb', nullable: true })
  updatedBy: {
    _id: string;
    email: string;
  } | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User, PremiumPlan } from '../../users/entities/user.entity';

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
}

export enum PaymentBillingCycle {
  MONTHLY = 'monthly',
  SEMI_ANNUAL = 'semi_annual',
  ANNUAL = 'annual',
}

@Entity('payment_orders')
@Index(['userId'])
@Index(['status'])
@Index(['orderCode'], { unique: true })
@Index(['expiresAt'])
export class PaymentOrder {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'order_code', type: 'bigint', unique: true })
  orderCode: number;

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
    default: PaymentBillingCycle.ANNUAL,
  })
  billingCycle: PaymentBillingCycle;

  @Column({ name: 'duration_days', type: 'int', default: 30 })
  durationDays: number;

  @Column({ type: 'decimal', precision: 12, scale: 0 })
  amount: number;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ name: 'checkout_url', type: 'varchar', length: 500, nullable: true })
  checkoutUrl: string | null;

  @Column({ name: 'payment_link_id', type: 'varchar', length: 255, nullable: true })
  paymentLinkId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ name: 'transaction_reference', type: 'varchar', length: 255, nullable: true })
  transactionReference: string | null;

  @Column({ name: 'counter_account_bank_name', type: 'varchar', length: 255, nullable: true })
  counterAccountBankName: string | null;

  @Column({ name: 'counter_account_name', type: 'varchar', length: 255, nullable: true })
  counterAccountName: string | null;

  @Column({ name: 'counter_account_number', type: 'varchar', length: 255, nullable: true })
  counterAccountNumber: string | null;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'vat_invoice_requested', type: 'boolean', default: false })
  vatInvoiceRequested: boolean;

  @Column({ name: 'vat_company_name', type: 'varchar', length: 255, nullable: true })
  vatCompanyName: string | null;

  @Column({ name: 'vat_tax_code', type: 'varchar', length: 50, nullable: true })
  vatTaxCode: string | null;

  @Column({ name: 'vat_address', type: 'varchar', length: 255, nullable: true })
  vatAddress: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  IsBoolean,
  Min,
} from 'class-validator';
import { PremiumPlan } from '../../users/entities/user.entity';
import { PaymentBillingCycle } from '../entities/payment-order.entity';

const transformNumber = ({ value }: { value: any }) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const num = Number(value);
  return isNaN(num) ? undefined : num;
};

const transformNumberWithDefault =
  (defaultValue: number) =>
  ({ value }: { value: any }) => {
    if (value === '' || value === null || value === undefined)
      return defaultValue;
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  };

export class CreatePremiumPackageDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsNotEmpty({ message: 'Loại gói không được để trống' })
  @IsEnum(PremiumPlan, { message: 'Loại gói không hợp lệ' })
  planType: PremiumPlan;

  @IsNotEmpty({ message: 'Chu kỳ thanh toán không được để trống' })
  @IsEnum(PaymentBillingCycle, { message: 'Chu kỳ thanh toán không hợp lệ' })
  billingCycle: PaymentBillingCycle;

  @IsNotEmpty({ message: 'Tên gói không được để trống' })
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Transform(transformNumber)
  @IsNotEmpty({ message: 'Giá gói không được để trống' })
  @IsNumber({}, { message: 'Giá gói phải là số' })
  @Min(0, { message: 'Giá gói không được âm' })
  price: number;

  @IsOptional()
  @Transform(transformNumber)
  @IsNumber({}, { message: 'Giá gốc phải là số' })
  @Min(0, { message: 'Giá gốc không được âm' })
  originalPrice?: number;

  @Transform(transformNumber)
  @IsNotEmpty({ message: 'Thời hạn không được để trống' })
  @IsNumber({}, { message: 'Thời hạn phải là số ngày' })
  @Min(1, { message: 'Thời hạn tối thiểu là 1 ngày' })
  durationDays: number;

  @IsOptional()
  @Transform(transformNumberWithDefault(0))
  @IsNumber()
  @Min(0)
  aiQuota?: number;

  @IsOptional()
  @IsString()
  badge?: string;

  @IsOptional()
  @IsArray()
  features?: string[];

  @IsOptional()
  @Transform(transformNumberWithDefault(0))
  @IsNumber()
  @Min(0)
  hotJobLimit?: number;

  @IsOptional()
  @Transform(transformNumberWithDefault(0))
  @IsNumber()
  candidateSearchLimit?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(transformNumberWithDefault(1))
  @IsNumber()
  displayOrder?: number;
}

export class UpdatePremiumPackageDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEnum(PremiumPlan)
  planType?: PremiumPlan;

  @IsOptional()
  @IsEnum(PaymentBillingCycle)
  billingCycle?: PaymentBillingCycle;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(transformNumber)
  @IsNumber({}, { message: 'Giá gói phải là số' })
  @Min(0, { message: 'Giá gói không được âm' })
  price?: number;

  @IsOptional()
  @Transform(transformNumber)
  @IsNumber({}, { message: 'Giá gốc phải là số' })
  @Min(0, { message: 'Giá gốc không được âm' })
  originalPrice?: number;

  @IsOptional()
  @Transform(transformNumber)
  @IsNumber({}, { message: 'Thời hạn phải là số ngày' })
  @Min(1, { message: 'Thời hạn tối thiểu là 1 ngày' })
  durationDays?: number;

  @IsOptional()
  @Transform(transformNumberWithDefault(0))
  @IsNumber()
  @Min(0)
  aiQuota?: number;

  @IsOptional()
  @IsString()
  badge?: string;

  @IsOptional()
  @IsArray()
  features?: string[];

  @IsOptional()
  @Transform(transformNumberWithDefault(0))
  @IsNumber()
  @Min(0)
  hotJobLimit?: number;

  @IsOptional()
  @Transform(transformNumberWithDefault(0))
  @IsNumber()
  candidateSearchLimit?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(transformNumberWithDefault(0))
  @IsNumber()
  displayOrder?: number;
}

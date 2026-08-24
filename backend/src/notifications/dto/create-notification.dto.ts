import { IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import {
  NotificationType,
  NotificationTargetType,
} from '../entities/notification.entity';

export class CreateNotificationDto {
  @IsNotEmpty({ message: 'User ID is required' })
  userId: string;

  @IsNotEmpty({ message: 'Title is required' })
  title: string;

  @IsOptional()
  content?: string;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsEnum(NotificationTargetType)
  targetType?: NotificationTargetType;

  @IsOptional()
  targetId?: string;

  @IsOptional()
  data?: Record<string, any>;
}

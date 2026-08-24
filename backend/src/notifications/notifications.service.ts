import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateNotificationDto } from './dto/create-notification.dto';
import {
  Notification,
  NotificationType,
  NotificationTargetType,
} from './entities/notification.entity';
import { IUser } from 'src/users/users.interface';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  // Create a single notification and push it via WebSocket in realtime
  async create(createNotificationDto: CreateNotificationDto) {
    const { userId, title, content, type, targetType, targetId, data } =
      createNotificationDto;

    const notification = this.notificationRepo.create({
      userId,
      title,
      content,
      type: (type as NotificationType) || NotificationType.SYSTEM,
      targetType:
        (targetType as NotificationTargetType) || NotificationTargetType.NONE,
      targetId: targetId || undefined,
      data,
    });

    const savedNotification = await this.notificationRepo.save(notification);

    // Emit socket event to target user
    this.notificationsGateway.sendToUser(
      userId,
      'notification',
      savedNotification,
    );

    return savedNotification;
  }

  // Create multiple notifications at once (used for notifying HR list or followers)
  async createBulk(
    userIds: string[],
    title: string,
    content: string,
    type: NotificationType = NotificationType.SYSTEM,
    targetType: NotificationTargetType = NotificationTargetType.NONE,
    targetId?: string,
    data?: Record<string, any>,
  ) {
    const notifications = userIds.map((userId) =>
      this.notificationRepo.create({
        userId,
        title,
        content,
        type,
        targetType,
        targetId: targetId || undefined,
        data,
      }),
    );

    const result = await this.notificationRepo.save(notifications);

    // Emit socket event to each user in the list
    userIds.forEach((userId, idx) => {
      this.notificationsGateway.sendToUser(userId, 'notification', result[idx]);
    });
    return result;
  }

  // Get paginated notifications for a user, including unread count
  async findByUser(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [notifications, total] = await this.notificationRepo.findAndCount({
      where: { userId, isDeleted: false },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const unreadCount = await this.notificationRepo.count({
      where: {
        userId,
        isRead: false,
        isDeleted: false,
      },
    });

    return {
      result: notifications,
      meta: {
        current: page,
        pageSize: limit,
        pages: Math.ceil(total / limit),
        total,
        unreadCount,
      },
    };
  }

  // Mark a single notification as read
  async markAsRead(id: string, user: IUser) {
    await this.notificationRepo.update(
      { _id: id, userId: user._id },
      { isRead: true, readAt: new Date() },
    );
    return await this.notificationRepo.findOne({ where: { _id: id } });
  }

  // Mark all user's notifications as read
  async markAllAsRead(user: IUser) {
    return await this.notificationRepo.update(
      { userId: user._id, isRead: false },
      { isRead: true, readAt: new Date() },
    );
  }

  // Soft delete a notification
  async remove(id: string, user: IUser) {
    await this.notificationRepo.update(
      { _id: id, userId: user._id },
      { isDeleted: true, deletedAt: new Date() },
    );
    return await this.notificationRepo.softDelete({
      _id: id,
      userId: user._id,
    });
  }

  // Count unread notifications for a user
  async getUnreadCount(userId: string) {
    return await this.notificationRepo.count({
      where: {
        userId,
        isRead: false,
        isDeleted: false,
      },
    });
  }
}

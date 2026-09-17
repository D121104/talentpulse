import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { ChatMessage, ChatMessageType } from './entities/chat-message.entity';
import { Application } from 'src/applications/entities/application.entity';
import { Company } from 'src/companies/entities/company.entity';
import { User } from 'src/users/entities/user.entity';
import { IUser } from 'src/users/users.interface';
import { Role } from 'src/decorator/customize';
import { CreateMessageDto } from './dto/create-message.dto';
import { StartConversationDto } from './dto/start-conversation.dto';
import { ChatGateway } from './chat.gateway';
import { UsersService } from 'src/users/users.service';

import {
  Notification,
  NotificationType,
  NotificationTargetType,
} from 'src/notifications/entities/notification.entity';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,

    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,

    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,

    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,

    private readonly chatGateway: ChatGateway,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly usersService: UsersService,
  ) {}

  // 1. Get or create conversation with strict application eligibility check
  async getOrCreateConversation(user: IUser, dto: StartConversationDto) {
    let candidateId: string;
    let companyId: string;

    if (user.role === Role.HR) {
      if (!user.company?._id) {
        throw new BadRequestException('Tài khoản HR chưa được liên kết với công ty nào.');
      }
      companyId = user.company._id;
      candidateId = dto.candidateId;
      if (!candidateId) {
        throw new BadRequestException('Vui lòng cung cấp candidateId của ứng viên.');
      }
    } else {
      // Candidate / Job seeker
      candidateId = user._id;
      companyId = dto.companyId;
      if (!companyId) {
        throw new BadRequestException('Vui lòng cung cấp companyId của công ty.');
      }
    }

    // Strict validation: Candidate MUST have applied to this company!
    const application = await this.applicationRepo.findOne({
      where: {
        userId: candidateId,
        companyId: companyId,
        isDeleted: false,
      },
    });

    if (!application) {
      throw new ForbiddenException(
        'Bạn chỉ có thể trò chuyện với đối tác sau khi ứng viên đã nộp hồ sơ ứng tuyển vào công ty.',
      );
    }

    // Look for existing conversation
    let conversation = await this.conversationRepo.findOne({
      where: {
        candidateId,
        companyId,
        isDeleted: false,
      },
      relations: ['candidate', 'company'],
    });

    if (!conversation) {
      const newConv = this.conversationRepo.create({
        candidateId,
        companyId,
        lastMessageText: null,
        lastMessageAt: new Date(),
        candidateUnreadCount: 0,
        companyUnreadCount: 0,
      });
      conversation = await this.conversationRepo.save(newConv);

      conversation = await this.conversationRepo.findOne({
        where: { _id: conversation._id },
        relations: ['candidate', 'company'],
      });
    }

    return this.formatConversation(conversation, user);
  }

  // 2. Get conversations list for current user
  async getConversations(user: IUser, search?: string) {
    const qb = this.conversationRepo
      .createQueryBuilder('conv')
      .leftJoinAndSelect('conv.candidate', 'candidate')
      .leftJoinAndSelect('conv.company', 'company')
      .where('conv.isDeleted = false');

    if (user.role === Role.HR) {
      if (!user.company?._id) return [];
      qb.andWhere('conv.companyId = :companyId', {
        companyId: user.company._id,
      });

      if (search && search.trim()) {
        qb.andWhere(
          '(candidate.name ILIKE :search OR candidate.email ILIKE :search)',
          { search: `%${search.trim()}%` },
        );
      }
    } else {
      // Candidate
      qb.andWhere('conv.candidateId = :candidateId', {
        candidateId: user._id,
      });

      if (search && search.trim()) {
        qb.andWhere('company.name ILIKE :search', {
          search: `%${search.trim()}%`,
        });
      }
    }

    qb.orderBy('conv.lastMessageAt', 'DESC', 'NULLS LAST').addOrderBy(
      'conv.createdAt',
      'DESC',
    );

    const conversations = await qb.getMany();
    return conversations.map((conv) => this.formatConversation(conv, user));
  }

  // 3. Get single conversation detail
  async getConversationById(user: IUser, id: string) {
    const conv = await this.conversationRepo.findOne({
      where: { _id: id, isDeleted: false },
      relations: ['candidate', 'company'],
    });

    if (!conv) {
      throw new NotFoundException('Cuộc trò chuyện không tồn tại.');
    }

    this.verifyUserInConversation(conv, user);
    return this.formatConversation(conv, user);
  }

  // 4. Get messages in a conversation
  async getMessages(user: IUser, conversationId: string, page = 1, limit = 50) {
    const conv = await this.conversationRepo.findOne({
      where: { _id: conversationId, isDeleted: false },
    });

    if (!conv) {
      throw new NotFoundException('Cuộc trò chuyện không tồn tại.');
    }

    this.verifyUserInConversation(conv, user);

    const skip = (page - 1) * limit;

    const [messages, total] = await this.messageRepo.findAndCount({
      where: {
        conversationId,
        isDeleted: false,
      },
      relations: ['sender'],
      order: {
        createdAt: 'ASC',
      },
      skip,
      take: limit,
    });

    return {
      result: messages.map((m) => this.formatMessage(m, user)),
      meta: {
        current: page,
        pageSize: limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  // 5. Send message
  async sendMessage(user: IUser, conversationId: string, dto: CreateMessageDto) {
    const conv = await this.conversationRepo.findOne({
      where: { _id: conversationId, isDeleted: false },
      relations: ['candidate', 'company'],
    });

    if (!conv) {
      throw new NotFoundException('Cuộc trò chuyện không tồn tại.');
    }

    this.verifyUserInConversation(conv, user);

    const senderRole = user.role === Role.HR ? 'HR' : 'CANDIDATE';
    const messageType = dto.messageType || ChatMessageType.TEXT;

    const newMsg = this.messageRepo.create({
      conversationId,
      senderId: user._id,
      senderRole,
      messageType,
      content: dto.content,
      fileName: dto.fileName,
      fileSize: dto.fileSize,
      isRead: false,
      reactions: [],
    });

    const savedMsg = await this.messageRepo.save(newMsg);

    // Update conversation snippet & counters
    let snippet = dto.content;
    if (messageType === ChatMessageType.IMAGE) {
      snippet = '[Hình ảnh]';
    } else if (messageType === ChatMessageType.FILE) {
      snippet = `[Tệp: ${dto.fileName || 'tệp tin'}]`;
    }

    conv.lastMessageText = snippet;
    conv.lastMessageAt = new Date();
    conv.lastSenderId = user._id;

    if (senderRole === 'CANDIDATE') {
      conv.companyUnreadCount = (conv.companyUnreadCount || 0) + 1;
    } else {
      conv.candidateUnreadCount = (conv.candidateUnreadCount || 0) + 1;
    }

    await this.conversationRepo.save(conv);

    const populatedMsg = await this.messageRepo.findOne({
      where: { _id: savedMsg._id },
      relations: ['sender'],
    });

    const formattedMsg = this.formatMessage(populatedMsg, user);

    // Collect all participant IDs for guaranteed broadcast delivery
    const participantIds = new Set<string>();
    participantIds.add(user._id);
    participantIds.add(conv.candidateId);

    let companyHrs: any[] = [];
    try {
      companyHrs = await this.usersService.findAllByCompanyId(conv.companyId);
      for (const hr of companyHrs) {
        if (hr?._id) participantIds.add(hr._id);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to fetch HRs for company ${conv.companyId}: ${err.message}`,
      );
    }

    // Realtime broadcast to BOTH the conversation room AND all participant user rooms!
    this.chatGateway.emitNewMessage(
      conversationId,
      formattedMsg,
      Array.from(participantIds),
    );

    // Send notifications to recipient(s)
    const notificationPayload = {
      conversationId,
      senderId: user._id,
      senderName:
        senderRole === 'HR'
          ? `${user.name} (${conv.company?.name})`
          : user.name,
      senderAvatar:
        senderRole === 'HR'
          ? conv.company?.logo || user.avatar
          : user.avatar,
      senderRole,
      content: snippet,
      createdAt: savedMsg.createdAt,
    };

    if (senderRole === 'CANDIDATE') {
      for (const hr of companyHrs) {
        this.chatGateway.emitNotification(hr._id, notificationPayload);
        const unread = await this.getUnreadCount(hr as any);
        this.chatGateway.emitUnreadCountUpdated(hr._id, unread.count);
      }
    } else {
      this.chatGateway.emitNotification(conv.candidateId, notificationPayload);
      const unread = await this.getUnreadCount({
        _id: conv.candidateId,
        role: Role.USER,
      } as any);
      this.chatGateway.emitUnreadCountUpdated(conv.candidateId, unread.count);
    }

    // Persistent Database Notification with Rate-limiting / Debounce
    await this.sendChatNotification(conv, user, snippet);

    return formattedMsg;
  }

  // 6. Mark conversation as read
  async markAsRead(user: IUser, conversationId: string) {
    const conv = await this.conversationRepo.findOne({
      where: { _id: conversationId, isDeleted: false },
    });

    if (!conv) {
      throw new NotFoundException('Cuộc trò chuyện không tồn tại.');
    }

    this.verifyUserInConversation(conv, user);

    const now = new Date();
    const isHr = user.role === Role.HR;
    const currentUnread = isHr
      ? conv.companyUnreadCount || 0
      : conv.candidateUnreadCount || 0;

    // Update unread messages from counterpart
    const updateResult = await this.messageRepo
      .createQueryBuilder()
      .update(ChatMessage)
      .set({ isRead: true, readAt: now })
      .where('conversationId = :cid AND senderId != :userId AND isRead = false', {
        cid: conversationId,
        userId: user._id,
      })
      .execute();

    const affectedMessages = updateResult.affected || 0;

    // Idempotency fast-path: If already 0 and no unread messages existed, return immediately without duplicate events
    if (currentUnread === 0 && affectedMessages === 0) {
      return { success: true, conversationId, alreadyRead: true };
    }

    if (isHr) {
      conv.companyUnreadCount = 0;
    } else {
      conv.candidateUnreadCount = 0;
    }

    await this.conversationRepo.save(conv);

    // Collect participants for guaranteed read-receipt delivery
    const participantIds = [user._id, conv.candidateId];
    try {
      const companyHrs = await this.usersService.findAllByCompanyId(conv.companyId);
      for (const hr of companyHrs) {
        if (hr?._id) participantIds.push(hr._id);
      }
    } catch {}

    // Emit read receipt event
    this.chatGateway.emitConversationRead(
      conversationId,
      {
        conversationId,
        readByRole: isHr ? 'HR' : 'CANDIDATE',
        readAt: now.toISOString(),
      },
      participantIds,
    );

    // Update unread count for current user
    const unread = await this.getUnreadCount(user);
    this.chatGateway.emitUnreadCountUpdated(user._id, unread.count);

    // Mark notifications for this conversation as read in notifications table
    try {
      const notifUpdate = await this.notificationRepo.update(
        {
          userId: user._id,
          targetId: conversationId,
          isRead: false,
          isDeleted: false,
        },
        {
          isRead: true,
          readAt: now,
        },
      );

      // Only emit unread notification count if notifications were actually marked as read
      if ((notifUpdate.affected || 0) > 0) {
        const unreadNotifCount = await this.notificationRepo.count({
          where: {
            userId: user._id,
            isRead: false,
            isDeleted: false,
          },
        });
        this.notificationsGateway.sendToUser(
          user._id,
          'notification_unread_count',
          { count: unreadNotifCount },
        );
      }
    } catch (err) {
      this.logger.warn(`Failed to mark notifications read for user ${user._id}: ${err.message}`);
    }

    return { success: true, conversationId };
  }

  // Helper: Send persistent notification to database with rate-limiting / debounce
  private async sendChatNotification(
    conv: Conversation,
    user: IUser,
    snippet: string,
  ) {
    const senderRole = user.role === Role.HR ? 'HR' : 'CANDIDATE';
    let recipientIds: string[] = [];
    let senderDisplayName = user.name;
    let senderAvatar = user.avatar;

    if (senderRole === 'CANDIDATE') {
      senderDisplayName = user.name;
      senderAvatar = user.avatar;
      try {
        const hrs = await this.usersService.findAllByCompanyId(conv.companyId);
        recipientIds = hrs.map((h: any) => h._id);
      } catch (err) {
        this.logger.warn(
          `Failed to find HRs for company ${conv.companyId}: ${err.message}`,
        );
      }
    } else {
      senderDisplayName = conv.company?.name || user.name;
      senderAvatar = conv.company?.logo || user.avatar;
      recipientIds = [conv.candidateId];
    }

    if (!recipientIds || recipientIds.length === 0) {
      return;
    }

    for (const recipientId of recipientIds) {
      try {
        // Rate-limit check: Find active UNREAD notification for this conversation
        const existingNotif = await this.notificationRepo.findOne({
          where: {
            userId: recipientId,
            targetId: conv._id,
            isRead: false,
            isDeleted: false,
          },
          order: { createdAt: 'DESC' },
        });

        if (existingNotif) {
          // Rate-limit hit: Continuous messaging -> update existing single notification
          const currentCount = (existingNotif.data?.messageCount || 1) + 1;
          existingNotif.title = `Tin nhắn mới từ ${senderDisplayName} (${currentCount} tin nhắn)`;
          existingNotif.content = snippet;
          existingNotif.updatedAt = new Date();
          existingNotif.data = {
            ...existingNotif.data,
            type: 'CHAT_MESSAGE',
            conversationId: conv._id,
            senderId: user._id,
            senderName: senderDisplayName,
            senderAvatar,
            companyId: conv.companyId,
            companyName: conv.company?.name,
            messageCount: currentCount,
            lastMessageAt: new Date(),
          };

          const updatedNotif = await this.notificationRepo.save(existingNotif);

          // Emit socket notification event
          this.notificationsGateway.sendToUser(
            recipientId,
            'notification',
            updatedNotif,
          );
        } else {
          // No unread notification -> Save a new record in notifications table
          const newNotif = this.notificationRepo.create({
            userId: recipientId,
            title: `Tin nhắn mới từ ${senderDisplayName}`,
            content: snippet,
            type: NotificationType.APPLICATION,
            targetType: NotificationTargetType.APPLICATION,
            targetId: conv._id,
            data: {
              type: 'CHAT_MESSAGE',
              conversationId: conv._id,
              senderId: user._id,
              senderName: senderDisplayName,
              senderAvatar,
              companyId: conv.companyId,
              companyName: conv.company?.name,
              messageCount: 1,
              createdAt: new Date(),
            },
          });

          const savedNotif = await this.notificationRepo.save(newNotif);

          // Emit realtime socket event
          this.notificationsGateway.sendToUser(
            recipientId,
            'notification',
            savedNotif,
          );
        }

        // Push updated unread notification count
        const unreadCount = await this.notificationRepo.count({
          where: {
            userId: recipientId,
            isRead: false,
            isDeleted: false,
          },
        });
        this.notificationsGateway.sendToUser(
          recipientId,
          'notification_unread_count',
          { count: unreadCount },
        );
      } catch (err) {
        this.logger.error(
          `Failed to save/update chat notification for user ${recipientId}: ${err.message}`,
        );
      }
    }
  }

  // 7. Add or toggle reaction on a message
  async addReaction(user: IUser, messageId: string, emoji: string) {
    const msg = await this.messageRepo.findOne({
      where: { _id: messageId, isDeleted: false },
    });

    if (!msg) {
      throw new NotFoundException('Tin nhắn không tồn tại.');
    }

    const reactions = msg.reactions || [];
    const existingIndex = reactions.findIndex((r) => r.userId === user._id);

    if (existingIndex > -1) {
      if (reactions[existingIndex].emoji === emoji) {
        // Toggle off
        reactions.splice(existingIndex, 1);
      } else {
        // Change emoji
        reactions[existingIndex].emoji = emoji;
        reactions[existingIndex].userName = user.name;
        reactions[existingIndex].createdAt = new Date().toISOString();
      }
    } else {
      reactions.push({
        userId: user._id,
        emoji,
        userName: user.name,
        createdAt: new Date().toISOString(),
      });
    }

    msg.reactions = reactions;
    await this.messageRepo.save(msg);

    const reactionPayload = {
      messageId,
      conversationId: msg.conversationId,
      reactions: msg.reactions,
    };

    const conv = await this.conversationRepo.findOne({
      where: { _id: msg.conversationId, isDeleted: false },
    });
    const participantIds = [user._id];
    if (conv) {
      participantIds.push(conv.candidateId);
      try {
        const companyHrs = await this.usersService.findAllByCompanyId(conv.companyId);
        for (const hr of companyHrs) {
          if (hr?._id) participantIds.push(hr._id);
        }
      } catch {}
    }

    this.chatGateway.emitReaction(msg.conversationId, reactionPayload, participantIds);
    return reactionPayload;
  }

  // 8. Get list of applied partners (applied companies for candidate, applied candidates for HR)
  async getAppliedPartners(user: IUser, search?: string) {
    if (user.role === Role.HR) {
      if (!user.company?._id) return [];

      const qb = this.applicationRepo
        .createQueryBuilder('app')
        .leftJoinAndSelect('app.user', 'candidate')
        .leftJoinAndSelect('app.job', 'job')
        .where('app.companyId = :companyId AND app.isDeleted = false', {
          companyId: user.company._id,
        });

      if (search && search.trim()) {
        qb.andWhere(
          '(candidate.name ILIKE :search OR candidate.email ILIKE :search OR job.name ILIKE :search)',
          { search: `%${search.trim()}%` },
        );
      }

      qb.orderBy('app.createdAt', 'DESC');
      const applications = await qb.getMany();

      // Distinct by candidateId
      const uniqueCandidatesMap = new Map<string, any>();
      for (const app of applications) {
        if (app.user && !uniqueCandidatesMap.has(app.userId)) {
          uniqueCandidatesMap.set(app.userId, {
            candidateId: app.user._id,
            candidateName: app.user.name || 'Ứng viên',
            candidateAvatar: app.user.avatar,
            candidateEmail: app.user.email,
            jobTitle: app.job?.name || 'Vị trí ứng tuyển',
            applicationStatus: app.status,
            appliedAt: app.createdAt,
          });
        }
      }

      const candidateList = Array.from(uniqueCandidatesMap.values());

      // Check which candidates already have conversation with this company
      const conversations = await this.conversationRepo.find({
        where: { companyId: user.company._id, isDeleted: false },
      });
      const convMap = new Map<string, string>(
        conversations.map((c) => [c.candidateId, c._id]),
      );

      return candidateList.map((item) => ({
        ...item,
        hasConversation: convMap.has(item.candidateId),
        conversationId: convMap.get(item.candidateId) || null,
      }));
    } else {
      // Candidate: get companies they applied to
      const qb = this.applicationRepo
        .createQueryBuilder('app')
        .leftJoinAndSelect('app.company', 'company')
        .leftJoinAndSelect('app.job', 'job')
        .where('app.userId = :userId AND app.isDeleted = false', {
          userId: user._id,
        });

      if (search && search.trim()) {
        qb.andWhere(
          '(company.name ILIKE :search OR job.name ILIKE :search)',
          { search: `%${search.trim()}%` },
        );
      }

      qb.orderBy('app.createdAt', 'DESC');
      const applications = await qb.getMany();

      // Distinct by companyId
      const uniqueCompaniesMap = new Map<string, any>();
      for (const app of applications) {
        if (app.company && !uniqueCompaniesMap.has(app.companyId)) {
          uniqueCompaniesMap.set(app.companyId, {
            companyId: app.company._id,
            companyName: app.company.name,
            companyLogo: app.company.logo,
            companyAddress: app.company.address,
            jobTitle: app.job?.name || 'Vị trí ứng tuyển',
            applicationStatus: app.status,
            appliedAt: app.createdAt,
          });
        }
      }

      const companyList = Array.from(uniqueCompaniesMap.values());

      // Check which companies already have conversation with this candidate
      const conversations = await this.conversationRepo.find({
        where: { candidateId: user._id, isDeleted: false },
      });
      const convMap = new Map<string, string>(
        conversations.map((c) => [c.companyId, c._id]),
      );

      return companyList.map((item) => ({
        ...item,
        hasConversation: convMap.has(item.companyId),
        conversationId: convMap.get(item.companyId) || null,
      }));
    }
  }

  // 9. Total unread messages count across all conversations
  async getUnreadCount(user: IUser) {
    if (user.role === Role.HR) {
      if (!user.company?._id) return { count: 0 };
      const res = await this.conversationRepo
        .createQueryBuilder('conv')
        .select('SUM(conv.companyUnreadCount)', 'sum')
        .where('conv.companyId = :companyId AND conv.isDeleted = false', {
          companyId: user.company._id,
        })
        .getRawOne();
      return { count: parseInt(res?.sum || '0', 10) };
    } else {
      const res = await this.conversationRepo
        .createQueryBuilder('conv')
        .select('SUM(conv.candidateUnreadCount)', 'sum')
        .where('conv.candidateId = :candidateId AND conv.isDeleted = false', {
          candidateId: user._id,
        })
        .getRawOne();
      return { count: parseInt(res?.sum || '0', 10) };
    }
  }

  // --- Helper Methods ---

  private verifyUserInConversation(conv: Conversation, user: IUser) {
    const isCandidate = conv.candidateId === user._id;
    const isCompanyHr =
      user.role === Role.HR &&
      user.company?._id &&
      conv.companyId === user.company._id;

    if (!isCandidate && !isCompanyHr && user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập cuộc trò chuyện này.',
      );
    }
  }

  private formatConversation(conv: Conversation, user: IUser) {
    const isHr = user.role === Role.HR;
    const partner = isHr
      ? {
          _id: conv.candidate?._id,
          name: conv.candidate?.name || 'Ứng viên',
          avatar: conv.candidate?.avatar || null,
          role: 'CANDIDATE',
          subtitle: 'Ứng viên nộp hồ sơ',
        }
      : {
          _id: conv.company?._id,
          name: conv.company?.name || 'Doanh nghiệp tuyển dụng',
          avatar: conv.company?.logo || null,
          role: 'COMPANY',
          subtitle: 'Phòng nhân sự',
        };

    return {
      _id: conv._id,
      candidateId: conv.candidateId,
      companyId: conv.companyId,
      partner,
      lastMessageText: conv.lastMessageText,
      lastMessageAt: conv.lastMessageAt,
      lastSenderId: conv.lastSenderId,
      unreadCount: isHr
        ? conv.companyUnreadCount || 0
        : conv.candidateUnreadCount || 0,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    };
  }

  private formatMessage(msg: ChatMessage, user: IUser) {
    const isMe = msg.senderId === user._id;
    return {
      _id: msg._id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      senderName: msg.sender?.name || 'Người dùng',
      senderAvatar: msg.sender?.avatar || null,
      senderRole: msg.senderRole,
      messageType: msg.messageType,
      content: msg.content,
      fileName: msg.fileName,
      fileSize: msg.fileSize,
      isRead: msg.isRead,
      readAt: msg.readAt,
      reactions: msg.reactions || [],
      isMe,
      createdAt: msg.createdAt,
    };
  }
}

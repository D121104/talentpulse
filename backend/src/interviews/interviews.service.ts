import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThan, MoreThan, Not, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  InterviewRound,
  InterviewRoundStatus,
  InterviewRoundType,
  InterviewResult,
} from './entities/interview-round.entity';
import {
  InterviewParticipant,
  ParticipantRole,
} from './entities/interview-participant.entity';
import { CreateInterviewRoundDto } from './dto/create-interview-round.dto';
import { UpdateInterviewRoundDto } from './dto/update-interview-round.dto';
import {
  ConfirmInterviewDto,
  InterviewFilterDto,
  SendInterviewInviteDto,
} from './dto/confirm-interview.dto';
import { IUser } from 'src/users/users.interface';
import { Role } from 'src/decorator/customize';
import { Application, ApplicationStatus } from 'src/applications/entities/application.entity';
import { ApplicationsService } from 'src/applications/applications.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import {
  NotificationTargetType,
  NotificationType,
} from 'src/notifications/entities/notification.entity';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name);

  constructor(
    @InjectRepository(InterviewRound)
    private readonly roundRepo: Repository<InterviewRound>,

    @InjectRepository(InterviewParticipant)
    private readonly participantRepo: Repository<InterviewParticipant>,

    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,

    @Inject(forwardRef(() => ApplicationsService))
    private readonly applicationsService: ApplicationsService,

    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,

    @InjectQueue('mail-queue')
    private readonly mailQueue: Queue,
  ) {}

  // 1. Create a new interview round
  async create(createDto: CreateInterviewRoundDto, user: IUser) {
    const application = await this.applicationRepo.findOne({
      where: { _id: createDto.applicationId, isDeleted: false },
      relations: ['job', 'company', 'user'],
    });

    if (!application) {
      throw new NotFoundException('Đơn ứng tuyển không tồn tại');
    }

    // Company boundary check for HR
    if (user.role === Role.HR) {
      const userCompanyId = user.company?._id;
      if (!userCompanyId || application.companyId !== userCompanyId) {
        throw new ForbiddenException(
          'Bạn không có quyền lên lịch phỏng vấn cho ứng viên của công ty khác.',
        );
      }
    }

    // Validate times
    const start = new Date(createDto.scheduledAt);
    const end = new Date(createDto.scheduledEndAt);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Thời gian phỏng vấn không hợp lệ.');
    }

    if (end <= start) {
      throw new BadRequestException(
        'Thời gian kết thúc phải diễn ra sau thời gian bắt đầu.',
      );
    }

    // Validate minimum 1 hour (60 minutes) duration
    const durationMs = end.getTime() - start.getTime();
    const minMs = 60 * 60 * 1000;
    if (durationMs < minMs) {
      throw new BadRequestException(
        'Thời lượng buổi phỏng vấn tối thiểu là 1 giờ (60 phút).',
      );
    }

    const durationMinutes = Math.round(durationMs / 60000);

    // Schedule collision detection:
    // Check if there is an overlapping round in the company that is active
    const overlapping = await this.roundRepo
      .createQueryBuilder('round')
      .where('round.companyId = :companyId', { companyId: application.companyId })
      .andWhere('round.isDeleted = false')
      .andWhere('round.status IN (:...activeStatuses)', {
        activeStatuses: [
          InterviewRoundStatus.PENDING_CONFIRMATION,
          InterviewRoundStatus.CONFIRMED,
          InterviewRoundStatus.IN_PROGRESS,
        ],
      })
      .andWhere('round.scheduledAt < :end', { end })
      .andWhere('round.scheduledEndAt > :start', { start })
      .getOne();

    if (overlapping) {
      throw new BadRequestException(
        `Khoảng thời gian này bị trùng với lịch phỏng vấn "${overlapping.title}" (${new Date(
          overlapping.scheduledAt,
        ).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
        })} - ${new Date(overlapping.scheduledEndAt).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
        })}). Vui lòng chọn khung giờ khác.`,
      );
    }

    // Generate unique roomId for online meeting
    const roomId = `room-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const meetingLink = `/interview-room/${roomId}`;

    // Create Round record
    const round = this.roundRepo.create({
      applicationId: application._id,
      companyId: application.companyId,
      title: createDto.title,
      roundNumber: createDto.roundNumber || 1,
      roundType: createDto.roundType || InterviewRoundType.TECHNICAL,
      status: InterviewRoundStatus.PENDING_CONFIRMATION,
      scheduledAt: start,
      scheduledEndAt: end,
      durationMinutes,
      roomId,
      meetingLink,
      location: createDto.location || 'Trực tuyến qua TalentPulse Meeting',
      isOnline: createDto.isOnline !== undefined ? createDto.isOnline : true,
      notes: createDto.notes,
      result: InterviewResult.PENDING,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
      updatedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    const savedRound = await this.roundRepo.save(round);

    // Add Candidate Participant
    const candidateParticipant = this.participantRepo.create({
      roundId: savedRound._id,
      userId: application.userId,
      role: ParticipantRole.CANDIDATE,
    });
    await this.participantRepo.save(candidateParticipant);

    // Add Assigned Interviewers
    if (createDto.interviewerIds && createDto.interviewerIds.length > 0) {
      for (const interviewerId of createDto.interviewerIds) {
        const participant = this.participantRepo.create({
          roundId: savedRound._id,
          userId: interviewerId,
          role: ParticipantRole.INTERVIEWER,
        });
        await this.participantRepo.save(participant);
      }
    } else {
      // Default to the current HR creator
      const participant = this.participantRepo.create({
        roundId: savedRound._id,
        userId: user._id,
        role: ParticipantRole.INTERVIEWER,
      });
      await this.participantRepo.save(participant);
    }

    // Move application to INTERVIEWING status if not already
    if (
      application.status === ApplicationStatus.PENDING ||
      application.status === ApplicationStatus.REVIEWING ||
      application.status === ApplicationStatus.CONSIDERING
    ) {
      try {
        await this.applicationsService.updateStatus(
          application._id,
          {
            status: ApplicationStatus.INTERVIEWING,
            note: `Đã lên lịch phỏng vấn: ${savedRound.title}`,
            sendEmail: false,
          },
          user,
        );
      } catch (err) {
        this.logger.warn(
          `Auto-updating application to INTERVIEWING bypassed: ${err.message}`,
        );
      }
    }

    const formattedTime = `${start.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    })} ngày ${start.toLocaleDateString('vi-VN')}`;

    // Dispatch In-App Notification to candidate
    try {
      await this.notificationsService.create({
        userId: application.userId,
        title: 'Lời mời xác nhận lịch phỏng vấn',
        content: `Nhà tuyển dụng từ công ty ${
          application.company?.name || ''
        } đã gửi lịch phỏng vấn "${savedRound.title}" vào lúc ${formattedTime}. Vui lòng xác nhận tham gia.`,
        type: NotificationType.INTERVIEW,
        targetType: NotificationTargetType.INTERVIEW,
        targetId: savedRound._id,
        data: {
          roundId: savedRound._id,
          applicationId: application._id,
          jobId: application.jobId,
          scheduledAt: savedRound.scheduledAt,
          durationMinutes: savedRound.durationMinutes,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to send interview notification: ${err.message}`);
    }

    // Optional email invitation to candidate
    if (createDto.sendEmailInvite !== false) {
      try {
        const candidateUser =
          application.user ||
          (await this.usersService.findOne(application.userId));
        if (candidateUser?.email) {
          const emailSubject = `[TalentPulse] Lời mời phỏng vấn vị trí ${
            application.job?.name || ''
          } - ${application.company?.name || ''}`;
          const emailBody = `Thông tin chi tiết buổi phỏng vấn:<br/>
• <strong>Vòng phỏng vấn:</strong> ${savedRound.title}<br/>
• <strong>Thời gian:</strong> ${formattedTime} (Dự kiến ${durationMinutes} phút)<br/>
• <strong>Hình thức:</strong> ${
            savedRound.isOnline
              ? 'Trực tuyến qua phòng phỏng vấn TalentPulse Meeting'
              : savedRound.location || 'Tại văn phòng'
          }${savedRound.notes ? `<br/>• <strong>Ghi chú:</strong> ${savedRound.notes}` : ''}`;

          await this.mailQueue.add(
            'send-application-status-email',
            {
              candidateEmail: candidateUser.email,
              candidateName: candidateUser.name || 'Ứng viên',
              jobTitle: application.job?.name || 'Vị trí tuyển dụng',
              companyName: application.company?.name || 'Doanh nghiệp',
              status: ApplicationStatus.INTERVIEWING,
              customSubject: emailSubject,
              customContent: emailBody,
            },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: true,
            },
          );
        }
      } catch (err) {
        this.logger.error(
          `Failed to enqueue interview email invite: ${err.message}`,
        );
      }
    }

    return await this.findOne(savedRound._id, user);
  }

  // 2. Candidate confirms or declines interview invitation
  async confirm(id: string, confirmDto: ConfirmInterviewDto, user: IUser) {
    const round = await this.roundRepo.findOne({
      where: { _id: id, isDeleted: false },
      relations: ['application', 'company', 'participants'],
    });

    if (!round) {
      throw new NotFoundException('Lịch phỏng vấn không tồn tại');
    }

    // Verify ownership: user must be the candidate of the application
    if (round.application?.userId !== user._id && user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Bạn không có quyền xác nhận lịch phỏng vấn này.',
      );
    }

    if (round.status !== InterviewRoundStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException(
        `Lịch phỏng vấn này hiện ở trạng thái ${round.status}, không thể thay đổi xác nhận.`,
      );
    }

    const isConfirm = confirmDto.action === 'CONFIRM';
    round.status = isConfirm
      ? InterviewRoundStatus.CONFIRMED
      : InterviewRoundStatus.DECLINED;

    if (isConfirm) {
      round.confirmedAt = new Date();
    } else {
      round.declinedAt = new Date();
    }

    if (confirmDto.feedback) {
      round.candidateFeedback = confirmDto.feedback;
    }

    round.updatedBy = {
      _id: user._id,
      email: user.email,
    };

    await this.roundRepo.save(round);

    // Notify HR of candidate confirmation or decline
    try {
      const hrUsers = await this.usersService.findAllByCompanyId(
        round.companyId,
      );
      const title = isConfirm
        ? 'Ứng viên đã xác nhận tham gia phỏng vấn'
        : 'Ứng viên từ chối lịch phỏng vấn';
      const content = isConfirm
        ? `Ứng viên ${user.name} đã đồng ý tham gia buổi phỏng vấn "${
            round.title
          }" vào lúc ${new Date(round.scheduledAt).toLocaleString('vi-VN')}.`
        : `Ứng viên ${user.name} đã từ chối lịch phỏng vấn "${round.title}". Lý do: ${
            confirmDto.feedback || 'Không nêu lý do'
          }.`;

      for (const hr of hrUsers) {
        await this.notificationsService.create({
          userId: hr._id,
          title,
          content,
          type: NotificationType.INTERVIEW,
          targetType: NotificationTargetType.INTERVIEW,
          targetId: round._id,
          data: {
            roundId: round._id,
            status: round.status,
            action: confirmDto.action,
          },
        });
      }
    } catch (err) {
      this.logger.error(`Failed to notify HR of interview action: ${err.message}`);
    }

    return await this.findOne(id, user);
  }

  // 3. HR manually sends online invite when interview time arrives
  async sendOnlineInvite(
    id: string,
    inviteDto: SendInterviewInviteDto,
    user: IUser,
  ) {
    const round = await this.roundRepo.findOne({
      where: { _id: id, isDeleted: false },
      relations: ['application', 'company', 'participants'],
    });

    if (!round) {
      throw new NotFoundException('Lịch phỏng vấn không tồn tại');
    }

    if (user.role === Role.HR) {
      const userCompanyId = user.company?._id;
      if (!userCompanyId || round.companyId !== userCompanyId) {
        throw new ForbiddenException(
          'Bạn không có quyền gửi lời mời phỏng vấn cho ứng viên của công ty khác.',
        );
      }
    }

    if (!round.isOnline) {
      throw new BadRequestException(
        'Buổi phỏng vấn này là hình thức trực tiếp (offline), không hỗ trợ phòng trực tuyến.',
      );
    }

    round.inviteSentAt = new Date();
    round.status = InterviewRoundStatus.IN_PROGRESS;
    round.startedAt = round.startedAt || new Date();
    round.updatedBy = {
      _id: user._id,
      email: user.email,
    };

    await this.roundRepo.save(round);

    // Notify candidate with high-priority invite containing direct meeting link
    try {
      const candidateId = round.application?.userId;
      if (candidateId) {
        await this.notificationsService.create({
          userId: candidateId,
          title: 'Phòng phỏng vấn trực tuyến đã mở',
          content: `Nhà tuyển dụng đã mở phòng phỏng vấn cho buổi "${
            round.title
          }". Vui lòng nhấp vào đây để vào phòng ngay.${
            inviteDto?.customMessage ? ` Lời nhắn: ${inviteDto.customMessage}` : ''
          }`,
          type: NotificationType.INTERVIEW,
          targetType: NotificationTargetType.INTERVIEW,
          targetId: round._id,
          data: {
            roundId: round._id,
            roomId: round.roomId,
            meetingLink: round.meetingLink,
            action: 'JOIN_ONLINE_INTERVIEW',
          },
        });
      }
    } catch (err) {
      this.logger.error(`Failed to send online room invite: ${err.message}`);
    }

    return await this.findOne(id, user);
  }

  // 4. Update interview round details or result
  async update(id: string, updateDto: UpdateInterviewRoundDto, user: IUser) {
    const round = await this.roundRepo.findOne({
      where: { _id: id, isDeleted: false },
      relations: ['application', 'company'],
    });

    if (!round) {
      throw new NotFoundException('Lịch phỏng vấn không tồn tại');
    }

    if (user.role === Role.HR) {
      const userCompanyId = user.company?._id;
      if (!userCompanyId || round.companyId !== userCompanyId) {
        throw new ForbiddenException(
          'Bạn không có quyền chỉnh sửa lịch phỏng vấn của công ty khác.',
        );
      }
    }

    if (
      updateDto.expectedVersion !== undefined &&
      round.version !== updateDto.expectedVersion
    ) {
      throw new ConflictException(
        `Lịch phỏng vấn đã bị thay đổi bởi phiên khác (phiên bản: ${round.version}). Vui lòng tải lại trang.`,
      );
    }

    if (updateDto.title) round.title = updateDto.title;
    if (updateDto.roundType) round.roundType = updateDto.roundType;
    if (updateDto.status) round.status = updateDto.status;
    if (updateDto.result) round.result = updateDto.result;
    if (updateDto.location) round.location = updateDto.location;
    if (updateDto.notes) round.notes = updateDto.notes;
    if (updateDto.interviewerFeedback)
      round.interviewerFeedback = updateDto.interviewerFeedback;
    if (updateDto.score !== undefined) round.score = updateDto.score;

    if (updateDto.scheduledAt && updateDto.scheduledEndAt) {
      const start = new Date(updateDto.scheduledAt);
      const end = new Date(updateDto.scheduledEndAt);
      if (end <= start) {
        throw new BadRequestException('Thời gian kết thúc phải sau thời gian bắt đầu');
      }
      const durationMs = end.getTime() - start.getTime();
      if (durationMs < 60 * 60 * 1000) {
        throw new BadRequestException(
          'Thời lượng buổi phỏng vấn tối thiểu là 1 giờ (60 phút).',
        );
      }
      round.scheduledAt = start;
      round.scheduledEndAt = end;
      round.durationMinutes = Math.round(durationMs / 60000);
      round.status = InterviewRoundStatus.RESCHEDULED;
    }

    round.updatedBy = {
      _id: user._id,
      email: user.email,
    };

    await this.roundRepo.save(round);
    return await this.findOne(id, user);
  }

  // 5. Query interview rounds for Calendar matrix view
  async getCalendarMatrix(
    companyId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const qb = this.roundRepo
      .createQueryBuilder('round')
      .leftJoinAndSelect('round.application', 'application')
      .leftJoinAndSelect('application.job', 'job')
      .leftJoinAndSelect('application.user', 'candidate')
      .leftJoinAndSelect('round.participants', 'participants')
      .leftJoinAndSelect('participants.user', 'participantUser')
      .where('round.companyId = :companyId', { companyId })
      .andWhere('round.isDeleted = false');

    if (startDate) {
      qb.andWhere('round.scheduledAt >= :startDate', {
        startDate: new Date(startDate),
      });
    }

    if (endDate) {
      qb.andWhere('round.scheduledEndAt <= :endDate', {
        endDate: new Date(endDate),
      });
    }

    qb.orderBy('round.scheduledAt', 'ASC');

    const rounds = await qb.getMany();
    const now = new Date();
    const expiredRounds = rounds.filter(
      (r) =>
        r.scheduledEndAt &&
        new Date(r.scheduledEndAt) < now &&
        r.status !== InterviewRoundStatus.COMPLETED &&
        r.status !== InterviewRoundStatus.CANCELLED,
    );

    if (expiredRounds.length > 0) {
      for (const r of expiredRounds) {
        r.status = InterviewRoundStatus.COMPLETED;
        if (!r.endedAt) r.endedAt = r.scheduledEndAt;
      }
      await this.roundRepo.save(expiredRounds);
    }

    return rounds;
  }

  // 6. Find all rounds with filtering
  async findAll(filter: InterviewFilterDto, user: IUser) {
    const qb = this.roundRepo
      .createQueryBuilder('round')
      .leftJoinAndSelect('round.application', 'application')
      .leftJoinAndSelect('application.job', 'job')
      .leftJoinAndSelect('application.user', 'candidate')
      .leftJoinAndSelect('round.participants', 'participants')
      .where('round.isDeleted = false');

    if (user.role === Role.HR) {
      if (user.company?._id) {
        qb.andWhere('round.companyId = :companyId', {
          companyId: user.company._id,
        });
      }
    } else if (user.role === Role.USER) {
      qb.andWhere('application.userId = :userId', { userId: user._id });
    }

    if (filter.applicationId) {
      qb.andWhere('round.applicationId = :applicationId', {
        applicationId: filter.applicationId,
      });
    }

    if (filter.status) {
      qb.andWhere('round.status = :status', { status: filter.status });
    }

    if (filter.startDate) {
      qb.andWhere('round.scheduledAt >= :startDate', {
        startDate: new Date(filter.startDate),
      });
    }

    if (filter.endDate) {
      qb.andWhere('round.scheduledEndAt <= :endDate', {
        endDate: new Date(filter.endDate),
      });
    }

    qb.orderBy('round.scheduledAt', 'ASC');

    const rounds = await qb.getMany();
    const now = new Date();
    const expiredRounds = rounds.filter(
      (r) =>
        r.scheduledEndAt &&
        new Date(r.scheduledEndAt) < now &&
        r.status !== InterviewRoundStatus.COMPLETED &&
        r.status !== InterviewRoundStatus.CANCELLED,
    );

    if (expiredRounds.length > 0) {
      for (const r of expiredRounds) {
        r.status = InterviewRoundStatus.COMPLETED;
        if (!r.endedAt) r.endedAt = r.scheduledEndAt;
      }
      await this.roundRepo.save(expiredRounds);
    }

    return rounds;
  }

  // 7. Find single round by ID
  async findOne(id: string, user: IUser) {
    const round = await this.roundRepo.findOne({
      where: { _id: id, isDeleted: false },
      relations: [
        'application',
        'application.job',
        'application.user',
        'company',
        'participants',
        'participants.user',
      ],
    });

    if (!round) {
      throw new NotFoundException('Lịch phỏng vấn không tồn tại');
    }

    const now = new Date();
    if (
      round.scheduledEndAt &&
      new Date(round.scheduledEndAt) < now &&
      round.status !== InterviewRoundStatus.COMPLETED &&
      round.status !== InterviewRoundStatus.CANCELLED
    ) {
      round.status = InterviewRoundStatus.COMPLETED;
      if (!round.endedAt) round.endedAt = round.scheduledEndAt;
      await this.roundRepo.save(round);
    }

    // Role check
    if (user.role === Role.USER && round.application?.userId !== user._id) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập lịch phỏng vấn này.',
      );
    }

    if (user.role === Role.HR) {
      const userCompanyId = user.company?._id;
      if (!userCompanyId || round.companyId !== userCompanyId) {
        throw new ForbiddenException(
          'Bạn không có quyền truy cập lịch phỏng vấn của công ty khác.',
        );
      }
    }

    return round;
  }

  // 8. Find round by roomId for online meeting room
  async findByRoomId(roomId: string, user: IUser) {
    const round = await this.roundRepo.findOne({
      where: { roomId, isDeleted: false },
      relations: [
        'application',
        'application.job',
        'application.user',
        'company',
        'participants',
        'participants.user',
      ],
    });

    if (!round) {
      throw new NotFoundException('Phòng phỏng vấn không tồn tại');
    }

    const now = new Date();
    const isPastEndTime =
      round.scheduledEndAt && now > new Date(round.scheduledEndAt);

    if (
      isPastEndTime &&
      round.status !== InterviewRoundStatus.COMPLETED &&
      round.status !== InterviewRoundStatus.CANCELLED
    ) {
      round.status = InterviewRoundStatus.COMPLETED;
      if (!round.endedAt) round.endedAt = round.scheduledEndAt;
      await this.roundRepo.save(round);
    }

    if (
      round.status === InterviewRoundStatus.COMPLETED ||
      round.status === InterviewRoundStatus.CANCELLED ||
      isPastEndTime
    ) {
      throw new BadRequestException(
        'Phòng phỏng vấn này đã kết thúc hoặc không còn tồn tại.',
      );
    }

    // Candidate or company HR can access
    const isCandidate = round.application?.userId === user._id;
    const isHR =
      (user.role === Role.HR && user.company?._id === round.companyId) ||
      user.role === Role.ADMIN;
    const isAssignedInterviewer = round.participants?.some(
      (p) => p.userId === user._id,
    );

    if (!isCandidate && !isHR && !isAssignedInterviewer) {
      throw new ForbiddenException(
        'Bạn không được phân quyền tham gia phòng phỏng vấn này.',
      );
    }

    return {
      round,
      userRoleInRoom: isCandidate ? 'CANDIDATE' : 'INTERVIEWER',
    };
  }

  // 9. HR ends meeting room immediately for all participants
  async endMeetingByRoomId(roomId: string, user: IUser) {
    const round = await this.roundRepo.findOne({
      where: { roomId, isDeleted: false },
      relations: ['application', 'company'],
    });

    if (!round) {
      throw new NotFoundException('Phòng phỏng vấn không tồn tại');
    }

    if (user.role === Role.HR) {
      const userCompanyId = user.company?._id;
      if (!userCompanyId || round.companyId !== userCompanyId) {
        throw new ForbiddenException(
          'Bạn không có quyền kết thúc buổi phỏng vấn này.',
        );
      }
    }

    round.status = InterviewRoundStatus.COMPLETED;
    round.endedAt = new Date();
    round.updatedBy = {
      _id: user._id,
      email: user.email,
    };

    await this.roundRepo.save(round);

    return {
      success: true,
      message: 'Buổi phỏng vấn đã được kết thúc thành công.',
      round,
    };
  }

  // 10. Direct raw lookup by roomId for WebSocket gateway checks
  async findRawByRoomId(roomId: string): Promise<InterviewRound | null> {
    return this.roundRepo.findOne({
      where: { roomId, isDeleted: false },
    });
  }

  // 11. Internal completion helper when expired or room closed via gateway
  async internalCompleteRoundByRoomId(
    roomId: string,
    note?: string,
  ): Promise<InterviewRound | null> {
    const round = await this.roundRepo.findOne({
      where: { roomId, isDeleted: false },
    });
    if (!round) return null;

    if (round.status !== InterviewRoundStatus.COMPLETED) {
      round.status = InterviewRoundStatus.COMPLETED;
      round.endedAt = round.scheduledEndAt && new Date() > new Date(round.scheduledEndAt)
        ? round.scheduledEndAt
        : new Date();
      if (note && !round.notes) {
        round.notes = note;
      }
      await this.roundRepo.save(round);
    }
    return round;
  }
}

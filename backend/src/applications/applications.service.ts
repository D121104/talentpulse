import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Application, ApplicationStatus } from './entities/application.entity';
import { CVMatchResult } from 'src/ai-matching/entities/cv-match-result.entity';
import { IUser } from 'src/users/users.interface';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application.dto';
import { UsersService } from 'src/users/users.service';
import { UserCVsService } from 'src/usercvs/usercvs.service';
import { Role } from 'src/decorator/customize';
import aqp from 'api-query-params';
import { NotificationsService } from 'src/notifications/notifications.service';
import {
  NotificationTargetType,
  NotificationType,
} from 'src/notifications/entities/notification.entity';
import { AIMatchingService } from 'src/ai-matching/ai-matching.service';
import { CVProcessingService } from 'src/ai-matching/cv-processing.service';
import { JobsService } from 'src/jobs/jobs.service';
import {
  ICandidateMatchResult,
  IAIRankingResponse,
} from 'src/ai-matching/dto/ai-match-result.dto';
import { CreateNotificationDto } from 'src/notifications/dto/create-notification.dto';

@Injectable()
export class ApplicationsService implements OnModuleInit {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,

    @InjectRepository(CVMatchResult)
    private readonly cvMatchResultRepo: Repository<CVMatchResult>,

    private readonly usersService: UsersService,
    private readonly userCVsService: UserCVsService,
    private readonly notificationsService: NotificationsService,
    private readonly aiMatchingService: AIMatchingService,
    private readonly cvProcessingService: CVProcessingService,
    @Inject(forwardRef(() => JobsService))
    private readonly jobsService: JobsService,

    @InjectQueue('mail-queue')
    private readonly mailQueue: Queue,
  ) {}

  async onModuleInit() {
    try {
      await this.applicationRepo.query(
        `ALTER TYPE "applications_status_enum" ADD VALUE IF NOT EXISTS 'CONSIDERING';`,
      );
    } catch (e) {
      // Ignore if not supported or already added
    }
  }

  // User applies for a job with selected CV
  async create(createApplicationDto: CreateApplicationDto, user: IUser) {
    const { cvId, jobId, companyId, coverLetter } = createApplicationDto;

    const cv = await this.userCVsService.findOne(cvId, user);
    if (!cv) {
      throw new BadRequestException('CV không tồn tại hoặc không thuộc về bạn');
    }

    const job = await this.jobsService.findOne(jobId);
    if (!job) {
      throw new BadRequestException('Công việc không tồn tại');
    }

    const application = this.applicationRepo.create({
      cvId,
      userId: user._id,
      jobId,
      companyId,
      coverLetter,
      status: ApplicationStatus.PENDING,
      history: [
        {
          status: ApplicationStatus.PENDING,
          updatedAt: new Date(),
          updatedBy: {
            _id: user._id,
            email: user.email,
          },
        },
      ],
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    const savedApplication = await this.applicationRepo.save(application);

    // Queue CV processing for AI matching (async)
    try {
      const jobSkills = Array.isArray(job.skills)
        ? job.skills.map((s: any) => (typeof s === 'string' ? s : s.name))
        : [];

      let cvText = '';
      const cvDoc = cv as any;

      if (cvDoc.parsedText) {
        cvText = cvDoc.parsedText;
      } else if (cvDoc.onlineCvId) {
        const parts = [
          cvDoc.skills?.length ? `Skills: ${cvDoc.skills.join(', ')}` : '',
          cvDoc.education?.length
            ? `Education: ${cvDoc.education.join('. ')}`
            : '',
          cvDoc.experience?.length
            ? `Experience: ${cvDoc.experience.join('. ')}`
            : '',
          cvDoc.certificates?.length
            ? `Certificates: ${cvDoc.certificates.join(', ')}`
            : '',
          cvDoc.description || '',
        ];
        cvText = parts.filter(Boolean).join('\n');
      }

      if (cvText && cvText.length > 10) {
        await this.cvProcessingService.queueCVProcessing({
          cvId: cv._id.toString(),
          userId: user._id,
          applicationId: savedApplication._id.toString(),
          cvUrl: cv.url,
          cvText,
          job: {
            _id: job._id.toString(),
            name: job.name,
            description: job.description,
            skills: jobSkills,
            level: job.level,
          },
        });
      }
    } catch (error) {
      console.error('Failed to queue CV processing:', error);
    }

    const applicationInDb = await this.applicationRepo.findOne({
      where: { _id: savedApplication._id },
      relations: ['job', 'company', 'user'],
    });

    if (applicationInDb && applicationInDb.companyId) {
      const hrs = await this.usersService.findAllByCompanyId(
        applicationInDb.companyId,
      );

      if (hrs && hrs.length > 0) {
        for (const hr of hrs) {
          const notiObj: CreateNotificationDto = {
            userId: hr._id.toString(),
            title: 'Đơn ứng tuyển mới',
            content: `Bạn có một đơn ứng tuyển mới cho công việc ${
              applicationInDb.job?.name || ''
            } từ ứng viên ${applicationInDb.user?.name || ''}.`,
            type: NotificationType.RESUME,
            targetType: NotificationTargetType.APPLICATION,
            targetId: savedApplication._id.toString(),
            data: {
              applicationId: savedApplication._id.toString(),
              jobId: applicationInDb.jobId.toString(),
            },
          };

          this.notificationsService.create(notiObj);
        }
      }
    }

    return {
      _id: savedApplication._id,
      createdAt: savedApplication.createdAt,
    };
  }

  // Get all applications (Admin/HR)
  async findAll(qs: any, user: IUser) {
    const { filter, sort } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;

    const userInfo = await this.usersService.findOne(user._id);

    const limit = qs.pageSize ? parseInt(qs.pageSize) : 10;
    const current = qs.current ? parseInt(qs.current) : 1;
    const skip = (current - 1) * limit;

    const queryBuilder = this.applicationRepo
      .createQueryBuilder('app')
      .leftJoinAndSelect('app.cv', 'cv')
      .leftJoinAndSelect('app.user', 'user')
      .leftJoinAndSelect('app.company', 'company')
      .leftJoinAndSelect('app.job', 'job')
      .where('app.isDeleted = :isDeleted', { isDeleted: false });

    if (userInfo.role === Role.HR) {
      if (!userInfo.company || !userInfo.company._id) {
        return {
          meta: {
            current,
            pageSize: limit,
            pages: 0,
            total: 0,
          },
          result: [],
        };
      }
      queryBuilder.andWhere('app.companyId = :companyId', {
        companyId: userInfo.company._id,
      });
    } else if (filter.companyId) {
      queryBuilder.andWhere('app.companyId = :companyId', {
        companyId: filter.companyId,
      });
    }

    if (filter.status) {
      queryBuilder.andWhere('app.status = :status', { status: filter.status });
    }

    if (sort) {
      for (const [key, value] of Object.entries(sort)) {
        queryBuilder.addOrderBy(
          `app.${key}`,
          (value as number) === 1 ? 'ASC' : 'DESC',
        );
      }
    } else {
      queryBuilder.orderBy('app.createdAt', 'DESC');
    }

    const [applications, totalRecord] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPage = Math.ceil(totalRecord / limit);

    // Format fields with populated aliases for backward compatibility
    const formatted = applications.map((app) => ({
      ...app,
      cvId: app.cv
        ? { _id: app.cv._id, url: app.cv.url, title: app.cv.title }
        : app.cvId,
      userId: app.user
        ? {
            _id: app.user._id,
            name: app.user.name,
            email: app.user.email,
            avatar: app.user.avatar,
          }
        : app.userId,
      companyId: app.company
        ? {
            _id: app.company._id,
            name: app.company.name,
            logo: app.company.logo,
          }
        : app.companyId,
      jobId: app.job
        ? {
            _id: app.job._id,
            name: app.job.name,
            salary: app.job.salary,
            level: app.job.level,
          }
        : app.jobId,
    }));

    return {
      meta: {
        current,
        pageSize: limit,
        pages: totalPage,
        total: totalRecord,
      },
      result: formatted,
    };
  }

  // Get applications by job (for HR to review)
  async findByJob(jobId: string, qs: any, user: IUser) {
    if (user.role === Role.HR) {
      const userInfo = await this.usersService.findOne(user._id);
      if (!userInfo.company || !userInfo.company._id) {
        return {
          meta: {
            current: 1,
            pageSize: 10,
            pages: 0,
            total: 0,
          },
          result: [],
        };
      }
      const job = await this.jobsService.findOne(jobId);
      if (!job || job.company?._id?.toString() !== userInfo.company._id.toString()) {
        throw new BadRequestException('Bạn không có quyền xem ứng viên của công việc này');
      }
    }

    const limit = qs.pageSize ? parseInt(qs.pageSize) : 10;
    const current = qs.current ? parseInt(qs.current) : 1;
    const skip = (current - 1) * limit;

    const queryBuilder = this.applicationRepo
      .createQueryBuilder('app')
      .leftJoinAndSelect('app.cv', 'cv')
      .leftJoinAndSelect('app.user', 'user')
      .where('app.jobId = :jobId', { jobId })
      .andWhere('app.isDeleted = :isDeleted', { isDeleted: false });

    if (qs.status) {
      queryBuilder.andWhere('app.status = :status', { status: qs.status });
    }

    queryBuilder.orderBy('app.createdAt', 'DESC');

    const [applications, totalRecord] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPage = Math.ceil(totalRecord / limit);

    const formatted = applications.map((app) => ({
      ...app,
      cvId: app.cv
        ? { _id: app.cv._id, url: app.cv.url, title: app.cv.title }
        : app.cvId,
      userId: app.user
        ? {
            _id: app.user._id,
            name: app.user.name,
            email: app.user.email,
            address: app.user.address,
            gender: app.user.gender,
          }
        : app.userId,
    }));

    return {
      meta: {
        current,
        pageSize: limit,
        pages: totalPage,
        total: totalRecord,
      },
      result: formatted,
    };
  }

  // Get user's own applications
  async findByUser(user: IUser) {
    const applications = await this.applicationRepo.find({
      where: { userId: user._id, isDeleted: false },
      relations: ['cv', 'company', 'job'],
      order: { createdAt: 'DESC' },
    });

    return applications.map((app) => ({
      ...app,
      cvId: app.cv
        ? { _id: app.cv._id, url: app.cv.url, title: app.cv.title }
        : app.cvId,
      companyId: app.company
        ? {
            _id: app.company._id,
            name: app.company.name,
            logo: app.company.logo,
          }
        : app.companyId,
      jobId: app.job
        ? {
            _id: app.job._id,
            name: app.job.name,
            salary: app.job.salary,
            level: app.job.level,
            location: app.job.location,
          }
        : app.jobId,
    }));
  }

  // Get one application
  async findOne(id: string) {
    const app = await this.applicationRepo.findOne({
      where: { _id: id, isDeleted: false },
      relations: ['cv', 'user', 'company', 'job'],
    });

    if (!app) {
      throw new NotFoundException('Đơn ứng tuyển không tồn tại');
    }

    return {
      ...app,
      cvId: app.cv
        ? { _id: app.cv._id, url: app.cv.url, title: app.cv.title }
        : app.cvId,
      userId: app.user
        ? {
            _id: app.user._id,
            name: app.user.name,
            email: app.user.email,
            avatar: app.user.avatar,
            address: app.user.address,
          }
        : app.userId,
      companyId: app.company
        ? {
            _id: app.company._id,
            name: app.company.name,
            logo: app.company.logo,
          }
        : app.companyId,
      jobId: app.job
        ? {
            _id: app.job._id,
            name: app.job.name,
            salary: app.job.salary,
            level: app.job.level,
            location: app.job.location,
          }
        : app.jobId,
    };
  }

  // Mark application as viewed by HR (transitions from PENDING -> REVIEWING and sends realtime socket notification)
  async markAsViewed(id: string, user: IUser) {
    const application = await this.applicationRepo.findOne({
      where: { _id: id, isDeleted: false },
      relations: ['job', 'company', 'user'],
    });

    if (!application) {
      throw new NotFoundException('Đơn ứng tuyển không tồn tại');
    }

    if (application.status === ApplicationStatus.PENDING) {
      const history = application.history || [];
      history.push({
        status: ApplicationStatus.REVIEWING,
        updatedAt: new Date(),
        updatedBy: {
          _id: user._id,
          email: user.email,
        },
      });

      await this.applicationRepo.update(id, {
        status: ApplicationStatus.REVIEWING,
        history,
        updatedBy: {
          _id: user._id,
          email: user.email,
        },
      });

      const notiObj: CreateNotificationDto = {
        userId: application.userId,
        title: 'Nhà tuyển dụng đã xem CV của bạn',
        content: `Nhà tuyển dụng từ công ty ${
          application.company?.name || 'Doanh nghiệp'
        } đã mở xem hồ sơ ứng tuyển của bạn cho vị trí ${
          application.job?.name || ''
        }.`,
        type: NotificationType.RESUME,
        targetType: NotificationTargetType.APPLICATION,
        targetId: application._id,
        data: {
          applicationId: application._id,
          jobId: application.jobId,
          companyId: application.companyId,
          status: ApplicationStatus.REVIEWING,
        },
      };

      await this.notificationsService.create(notiObj);
    }

    return await this.findOne(id);
  }

  // Update application status (HR/Admin) -> sends realtime socket notification + pushes to Bull Queue for email
  async updateStatus(
    id: string,
    updateDto: UpdateApplicationStatusDto,
    user: IUser,
  ) {
    const application = await this.applicationRepo.findOne({
      where: { _id: id, isDeleted: false },
      relations: ['job', 'company', 'user'],
    });

    if (!application) {
      throw new NotFoundException('Đơn ứng tuyển không tồn tại');
    }

    const history = application.history || [];
    history.push({
      status: updateDto.status,
      updatedAt: new Date(),
      updatedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    await this.applicationRepo.update(id, {
      status: updateDto.status,
      history,
      updatedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    const notiObj: CreateNotificationDto = {
      userId: application.userId,
      title: '',
      content: '',
      type: NotificationType.RESUME,
      targetType: NotificationTargetType.APPLICATION,
      targetId: application._id,
      data: {
        applicationId: application._id,
        jobId: application.jobId,
        companyId: application.companyId,
        status: updateDto.status,
      },
    };

    switch (updateDto.status) {
      case ApplicationStatus.REVIEWING:
        notiObj.title = 'Nhà tuyển dụng đã xem CV của bạn';
        notiObj.content = `Nhà tuyển dụng từ công ty ${
          application.company?.name || ''
        } đã xem hồ sơ ứng tuyển của bạn cho vị trí ${
          application.job?.name || ''
        }.`;
        await this.notificationsService.create(notiObj);
        break;

      case ApplicationStatus.CONSIDERING:
        notiObj.title = 'Hồ sơ ứng tuyển của bạn đang được Cân nhắc';
        notiObj.content = `Nhà tuyển dụng từ công ty ${
          application.company?.name || ''
        } đã đánh giá CV của bạn cho vị trí ${
          application.job?.name || ''
        } là Cân nhắc.`;
        await this.notificationsService.create(notiObj);
        break;

      case ApplicationStatus.APPROVED:
        notiObj.title = 'Hồ sơ của bạn được đánh giá Phù hợp';
        notiObj.content = `Chúc mừng! Nhà tuyển dụng từ công ty ${
          application.company?.name || ''
        } đã đánh giá CV của bạn cho vị trí ${
          application.job?.name || ''
        } là Phù hợp.`;
        await this.notificationsService.create(notiObj);
        break;

      case ApplicationStatus.REJECTED:
        notiObj.title = 'Thông báo kết quả ứng tuyển';
        notiObj.content = `Nhà tuyển dụng từ công ty ${
          application.company?.name || ''
        } đã gửi thông báo kết quả cho vị trí ${
          application.job?.name || ''
        }.`;
        await this.notificationsService.create(notiObj);
        break;
    }

    // Push email job to Bull Queue asynchronously for CONSIDERING, APPROVED, REJECTED
    if (
      [
        ApplicationStatus.CONSIDERING,
        ApplicationStatus.APPROVED,
        ApplicationStatus.REJECTED,
      ].includes(updateDto.status)
    ) {
      try {
        let candidateEmail = application.user?.email;
        let candidateName = application.user?.name;

        if (!candidateEmail) {
          const userEntity = await this.usersService.findOne(application.userId);
          candidateEmail = userEntity?.email;
          candidateName = userEntity?.name;
        }

        if (candidateEmail) {
          await this.mailQueue.add(
            'send-application-status-email',
            {
              candidateEmail,
              candidateName: candidateName || 'Ứng viên',
              jobTitle: application.job?.name || 'Vị trí tuyển dụng',
              companyName: application.company?.name || 'Doanh nghiệp',
              status: updateDto.status,
            },
            {
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 2000,
              },
              removeOnComplete: true,
            },
          );
          this.logger.log(
            `Enqueued application status email for ${candidateEmail} (status: ${updateDto.status})`,
          );
        }
      } catch (err) {
        this.logger.error(`Failed to enqueue email job: ${err.message}`);
      }
    }

    return await this.findOne(id);
  }

  // Delete application (user can withdraw their application)
  async remove(id: string, user: IUser) {
    const application = await this.applicationRepo.findOne({
      where: {
        _id: id,
        userId: user._id,
        isDeleted: false,
      },
    });

    if (!application) {
      throw new BadRequestException(
        'Đơn ứng tuyển không tồn tại hoặc không thuộc về bạn',
      );
    }

    await this.applicationRepo.update(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    await this.cvMatchResultRepo.delete({ applicationId: id });

    return await this.applicationRepo.softDelete(id);
  }

  // Count applications by status for a company
  async countByCompany(companyId: string) {
    const stats = await this.applicationRepo
      .createQueryBuilder('app')
      .select('app.status', '_id')
      .addSelect('COUNT(app._id)', 'count')
      .where('app.companyId = :companyId', { companyId })
      .andWhere('app.isDeleted = :isDeleted', { isDeleted: false })
      .groupBy('app.status')
      .getRawMany();

    return stats.map((s) => ({
      _id: s._id,
      count: parseInt(s.count, 10),
    }));
  }

  // Count applications by job
  async countByJob(jobId: string) {
    return await this.applicationRepo.count({
      where: {
        jobId,
        isDeleted: false,
      },
    });
  }

  /**
   * AI-powered ranking of candidates for a specific job
   */
  async getAIRankedCandidates(
    jobId: string,
    topN = 10,
    user: IUser,
  ): Promise<IAIRankingResponse> {
    const job = await this.jobsService.findOne(jobId);
    if (!job) {
      throw new NotFoundException('Công việc không tồn tại');
    }

    if (user.role === Role.HR) {
      const userInfo = await this.usersService.findOne(user._id);
      if (
        !userInfo.company ||
        !userInfo.company._id ||
        job.company?._id?.toString() !== userInfo.company._id.toString()
      ) {
        throw new BadRequestException('Bạn không có quyền truy cập dữ liệu của công việc này');
      }
    }

    const totalApplications = await this.applicationRepo.count({
      where: {
        jobId,
        isDeleted: false,
      },
    });

    if (totalApplications === 0) {
      return {
        jobId,
        jobName: job.name,
        totalApplications: 0,
        rankedCandidates: [],
        processedAt: new Date().toISOString(),
      };
    }

    const rankedResults = await this.cvProcessingService.getRankedCandidates(
      jobId,
      topN,
    );

    const candidateResults: ICandidateMatchResult[] = rankedResults.map(
      (result: any) => {
        const userInfo = result.user;
        const cvInfo = result.cv;
        const appInfo = result.application;

        return {
          applicationId: appInfo?._id || result.applicationId || '',
          candidateId: userInfo?._id || '',
          candidateName: userInfo?.name || 'Ẩn danh',
          candidateEmail: userInfo?.email || '',
          candidateAvatar: userInfo?.avatar,
          cvId: cvInfo?._id || '',
          cvTitle: cvInfo?.title || 'CV',
          cvUrl: result.cvUrl || cvInfo?.url || '',
          matchScore: result.matchScore,
          matchedSkills: result.matchedSkills || [],
          missingSkills: result.missingSkills || [],
          shortExplanation: result.explanation || '',
          applicationStatus: appInfo?.status || 'PENDING',
          appliedAt: appInfo?.createdAt
            ? new Date(appInfo.createdAt).toISOString()
            : new Date().toISOString(),
        };
      },
    );

    const processingStatus = await this.cvProcessingService.getProcessingStatus(
      jobId,
    );

    return {
      jobId,
      jobName: job.name,
      totalApplications,
      rankedCandidates: candidateResults,
      processedAt: new Date().toISOString(),
      processingStatus,
    } as IAIRankingResponse;
  }

  /**
   * Search applications by CV content
   */
  async searchByCV(
    jobId: string,
    query: {
      skills?: string;
      education?: string;
      address?: string;
      certificates?: string;
    },
    user: IUser,
  ) {
    const job = await this.jobsService.findOne(jobId);
    if (!job) {
      throw new NotFoundException('Công việc không tồn tại');
    }

    if (user.role === Role.HR) {
      const userInfo = await this.usersService.findOne(user._id);
      if (
        !userInfo.company ||
        !userInfo.company._id ||
        job.company?._id?.toString() !== userInfo.company._id.toString()
      ) {
        throw new BadRequestException('Bạn không có quyền tìm kiếm ứng viên của công việc này');
      }
    }

    const skillKeywords = query.skills
      ? query.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const educationKeyword = query.education?.trim() || '';
    const addressKeyword = query.address?.trim() || '';
    const certificatesKeywords = query.certificates
      ? query.certificates
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (
      skillKeywords.length === 0 &&
      !educationKeyword &&
      !addressKeyword &&
      certificatesKeywords.length === 0
    ) {
      throw new BadRequestException(
        'Vui lòng nhập ít nhất một tiêu chí tìm kiếm',
      );
    }

    const queryBuilder = this.applicationRepo
      .createQueryBuilder('app')
      .leftJoinAndSelect('app.cv', 'cv')
      .leftJoinAndSelect('app.user', 'user')
      .where('app.jobId = :jobId', { jobId })
      .andWhere('app.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('(cv.isSearchable IS NULL OR cv.isSearchable = :isSearchable)', { isSearchable: true })
      .andWhere('(user.allowRecruiterSearch IS NULL OR user.allowRecruiterSearch = :allowSearch)', { allowSearch: true })
      .andWhere('(user.isJobSeeking IS NULL OR user.isJobSeeking = :isJobSeeking)', { isJobSeeking: true })
      .andWhere('user.isDeleted = :userNotDeleted', { userNotDeleted: false })
      .andWhere('(cv.isDeleted IS NULL OR cv.isDeleted = :cvNotDeleted)', { cvNotDeleted: false });

    // Build conditions for matching in PostgreSQL
    if (skillKeywords.length > 0) {
      const skillConds = skillKeywords.map(
        (sk, idx) =>
          `(EXISTS (SELECT 1 FROM unnest(cv.skills) s WHERE s ILIKE :sk_${idx}) OR cv.parsedText ILIKE :sk_${idx})`,
      );
      const params: Record<string, string> = {};
      skillKeywords.forEach((sk, idx) => {
        params[`sk_${idx}`] = `%${sk}%`;
      });
      queryBuilder.andWhere(`(${skillConds.join(' OR ')})`, params);
    }

    if (educationKeyword) {
      queryBuilder.andWhere(
        `(EXISTS (SELECT 1 FROM unnest(cv.education) e WHERE e ILIKE :edu) OR cv.parsedText ILIKE :edu)`,
        { edu: `%${educationKeyword}%` },
      );
    }

    if (addressKeyword) {
      queryBuilder.andWhere(
        `(user.address ILIKE :addr OR cv.parsedText ILIKE :addr)`,
        { addr: `%${addressKeyword}%` },
      );
    }

    if (certificatesKeywords.length > 0) {
      const certConds = certificatesKeywords.map(
        (ct, idx) =>
          `(EXISTS (SELECT 1 FROM unnest(cv.certificates) c WHERE c ILIKE :ct_${idx}) OR cv.parsedText ILIKE :ct_${idx})`,
      );
      const params: Record<string, string> = {};
      certificatesKeywords.forEach((ct, idx) => {
        params[`ct_${idx}`] = `%${ct}%`;
      });
      queryBuilder.andWhere(`(${certConds.join(' OR ')})`, params);
    }

    queryBuilder
      .addSelect(
        `(CASE WHEN user.boostExpiresAt > NOW() THEN 1 ELSE 0 END)`,
        'user_is_boosted',
      )
      .orderBy('user_is_boosted', 'DESC')
      .addOrderBy('user.isPremium', 'DESC')
      .addOrderBy('user.createdAt', 'DESC')
      .addOrderBy('user._id', 'DESC')
      .addOrderBy('app.createdAt', 'DESC')
      .addOrderBy('app._id', 'DESC');

    const applications = await queryBuilder.getMany();

    const now = new Date();
    const enrichedResults = applications.map((app) => {
      const matchedSkills: string[] = [];
      const matchedEducation: string[] = [];
      const matchedCertificates: string[] = [];
      let matchedAddress = false;
      let matchedInParsedText = false;

      if (skillKeywords.length > 0 && app.cv?.skills?.length) {
        for (const skill of app.cv.skills) {
          if (
            skillKeywords.some((kw) =>
              skill.toLowerCase().includes(kw.toLowerCase()),
            )
          ) {
            matchedSkills.push(skill);
          }
        }
      }

      if (educationKeyword && app.cv?.education?.length) {
        for (const edu of app.cv.education) {
          if (edu.toLowerCase().includes(educationKeyword.toLowerCase())) {
            matchedEducation.push(edu);
          }
        }
      }

      if (addressKeyword && app.user?.address) {
        if (
          app.user.address.toLowerCase().includes(addressKeyword.toLowerCase())
        ) {
          matchedAddress = true;
        }
      }

      if (certificatesKeywords.length > 0 && app.cv?.certificates?.length) {
        for (const cert of app.cv.certificates) {
          if (
            certificatesKeywords.some((kw) =>
              cert.toLowerCase().includes(kw.toLowerCase()),
            )
          ) {
            matchedCertificates.push(cert);
          }
        }
      }

      if (
        matchedSkills.length === 0 &&
        matchedEducation.length === 0 &&
        !matchedAddress &&
        matchedCertificates.length === 0
      ) {
        matchedInParsedText = true;
      }

      const isBoosted = Boolean(
        app.user?.boostExpiresAt && new Date(app.user.boostExpiresAt) > now,
      );

      return {
        _id: app._id,
        status: app.status,
        coverLetter: app.coverLetter,
        createdAt: app.createdAt,
        cvId: app.cv
          ? {
              _id: app.cv._id,
              url: app.cv.url,
              title: app.cv.title,
              skills: app.cv.skills,
              education: app.cv.education,
              certificates: app.cv.certificates,
              fileType: app.cv.fileType,
            }
          : app.cvId,
        userId: app.user
          ? {
              _id: app.user._id,
              name: app.user.name,
              email: app.user.email,
              avatar: app.user.avatar,
              address: app.user.address,
              isVerified: app.user.isVerified || false,
              isPremium: app.user.isPremium || false,
              isBoosted,
              boostExpiresAt: app.user.boostExpiresAt || null,
            }
          : app.userId,
        matchInfo: {
          matchedSkills,
          matchedEducation,
          matchedAddress,
          matchedCertificates,
          matchedInParsedText,
        },
      };
    });

    return {
      total: enrichedResults.length,
      result: enrichedResults,
    };
  }
}

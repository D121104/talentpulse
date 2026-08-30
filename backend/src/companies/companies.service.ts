import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from './entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';
import {
  Application,
  ApplicationStatus,
} from 'src/applications/entities/application.entity';
import { IUser } from 'src/users/users.interface';
import aqp from 'api-query-params';
import { FollowCompanyDto } from './dto/follow-company.dto';
import { RedisService } from 'src/redis/redis.service';
import { UsersService } from 'src/users/users.service';
import { Role } from 'src/decorator/customize';
import { NotificationsService } from 'src/notifications/notifications.service';
import { CreateNotificationDto } from 'src/notifications/dto/create-notification.dto';
import {
  NotificationTargetType,
  NotificationType,
} from 'src/notifications/entities/notification.entity';
import { ActiveJobQueryService } from 'src/active-jobs/active-job-query.service';
import {
  AiIndexAggregateType,
  AiIndexOutboxOperation,
} from 'src/ai-indexing/entities';
import { AiIndexingService } from 'src/ai-indexing/ai-indexing.service';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,

    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,

    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,

    private readonly redisService: RedisService,

    private readonly notificationService: NotificationsService,

    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,

    private readonly activeJobQueryService: ActiveJobQueryService,

    private readonly dataSource: DataSource,

    private readonly aiIndexingService: AiIndexingService,
  ) {}

  private toPublicCompanyResponse(company: Company) {
    return {
      _id: company._id,
      name: company.name,
      description: company.description,
      address: company.address,
      logo: company.logo,
      taxCode: company.taxCode,
      scale: company.scale,
      isActive: company.isActive,
      isPremium: company.isPremium,
      premiumExpiresAt: company.premiumExpiresAt,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };
  }

  private toHrMemberSummary(
    hr: IUser & { createdAt?: Date },
    creatorId?: string,
  ) {
    const isLead = Boolean(
      creatorId && hr._id?.toString() === creatorId.toString(),
    );

    return {
      _id: hr._id,
      name: hr.name,
      email: hr.email,
      avatar: hr.avatar,
      address: hr.address,
      role: hr.role,
      createdAt: hr.createdAt,
      isLead,
      hrRole: isLead ? 'LEAD' : 'MEMBER',
    };
  }

  private async getSanitizedCompanyHrs(companyId: string, company: Company) {
    const hrs = await this.usersService.findAllByCompanyId(companyId);
    const creatorId = company.createdBy?._id?.toString();

    return hrs.map((hr) => this.toHrMemberSummary(hr, creatorId));
  }

  private toPublicHrMemberSummary(
    hr: IUser & { createdAt?: Date },
    creatorId?: string,
  ) {
    const isLead = Boolean(
      creatorId && hr._id?.toString() === creatorId.toString(),
    );

    return {
      _id: hr._id,
      name: hr.name,
      avatar: hr.avatar,
      role: hr.role,
      createdAt: hr.createdAt,
      isLead,
      hrRole: isLead ? 'LEAD' : 'MEMBER',
    };
  }

  private async getPublicCompanyHrs(companyId: string, company: Company) {
    const hrs = await this.usersService.findAllByCompanyId(companyId);
    const creatorId = company.createdBy?._id?.toString();

    return hrs.map((hr) => this.toPublicHrMemberSummary(hr, creatorId));
  }

  private assertCompanyCreator(
    companyId: string,
    company: Company,
    approver: IUser,
    message: string,
  ) {
    const isAssignedHr =
      approver?.role === Role.HR &&
      approver?.company?._id?.toString() === companyId.toString();
    const isCreator =
      company.createdBy?._id?.toString() === approver?._id?.toString();

    if (!isAssignedHr || !isCreator) {
      throw new BadRequestException(message);
    }
  }

  private assertCompanyRosterAccess(
    companyId: string,
    company: Company,
    user: IUser,
  ) {
    if (user?.role === Role.ADMIN) {
      return;
    }

    const actorCompanyId = user?.company?._id?.toString();
    if (
      user?.role !== Role.HR ||
      !actorCompanyId ||
      actorCompanyId !== companyId.toString()
    ) {
      throw new BadRequestException(
        'You are not allowed to view this company roster',
      );
    }

    if (company._id?.toString() !== companyId.toString()) {
      throw new BadRequestException('Company not found');
    }
  }

  // Create a new company (Admin only), invalidate Redis cache
  async create(createCompanyDto: CreateCompanyDto, user: IUser) {
    const companyExist = await this.companyRepo.findOne({
      where: { name: createCompanyDto.name },
    });

    if (companyExist) throw new BadRequestException('Company already exists');

    const newCompany = this.companyRepo.create({
      ...createCompanyDto,
      isActive: true,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    const savedCompany = await this.companyRepo.save(newCompany);
    await this.redisService.invalidateCompaniesCache();

    return savedCompany;
  }

  async getAll() {
    return await this.companyRepo.find({
      where: { isActive: true, isDeleted: false },
    });
  }

  async getAllByAdmin(qs: any) {
    const { filter, sort } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;

    const limit = qs.pageSize ? parseInt(qs.pageSize) : 10;
    const current = qs.current ? parseInt(qs.current) : 1;
    const skip = (current - 1) * limit;

    const queryBuilder = this.companyRepo
      .createQueryBuilder('company')
      .where('company.isDeleted = :isDeleted', { isDeleted: false });

    if (filter.name) {
      queryBuilder.andWhere('company.name ILIKE :name', {
        name: `%${filter.name}%`,
      });
    }

    if (sort) {
      for (const [key, value] of Object.entries(sort)) {
        queryBuilder.addOrderBy(
          `company.${key}`,
          (value as number) === 1 ? 'ASC' : 'DESC',
        );
      }
    } else {
      queryBuilder.orderBy('company.createdAt', 'DESC');
    }

    const [companies, totalRecord] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPage = Math.ceil(totalRecord / limit);

    return {
      meta: {
        current: current,
        pageSize: limit,
        pages: totalPage,
        total: totalRecord,
      },
      result: companies.map((company) => this.toPublicCompanyResponse(company)),
    };
  }

  async findAll(qs: any) {
    const { filter, sort } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;
    delete filter.isActive;

    const cacheKey = 'companies-' + JSON.stringify(qs);
    const cacheData = await this.redisService.getValue<string>(cacheKey);

    // Extract userId for checking follow status
    const userId = filter.userId;
    delete filter.userId;

    const limit = qs.pageSize ? parseInt(qs.pageSize) : 10;
    const current = qs.current ? parseInt(qs.current) : 1;
    const skip = (current - 1) * limit;

    const queryBuilder = this.companyRepo
      .createQueryBuilder('company')
      .where('company.isActive = :isActive', { isActive: true })
      .andWhere('company.isDeleted = :isDeleted', { isDeleted: false });

    if (filter.name) {
      queryBuilder.andWhere('company.name ILIKE :name', {
        name: `%${filter.name}%`,
      });
    }

    if (sort) {
      for (const [key, value] of Object.entries(sort)) {
        queryBuilder.addOrderBy(
          `company.${key}`,
          (value as number) === 1 ? 'ASC' : 'DESC',
        );
      }
    } else {
      queryBuilder.orderBy('company.createdAt', 'DESC');
    }

    const [companies, totalRecord] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPage = Math.ceil(totalRecord / limit);

    // Add isFollowed & jobCount field for each company
    const companiesWithJobCount = await Promise.all(
      companies.map(async (company) => {
        const isFollowed = userId
          ? (company.usersFollow || []).some(
              (followerId) => followerId === userId,
            )
          : false;

        const jobCount = await this.jobRepo
          .createQueryBuilder('job')
          .where("job.company->>'_id' = :companyId", { companyId: company._id })
          .andWhere('job.isDeleted = :isDeleted', { isDeleted: false })
          .getCount();

        return {
          ...this.toPublicCompanyResponse(company),
          isFollowed,
          jobCount,
        };
      }),
    );

    const response = {
      meta: {
        current: current,
        pageSize: limit,
        pages: totalPage,
        total: totalRecord,
      },
      result: companiesWithJobCount,
    };

    await this.redisService.setValue(cacheKey, JSON.stringify(response), 60);

    return response;
  }

  // User follows a company. Adds userId to usersFollow array.
  async followCompany(companyDto: FollowCompanyDto, user: IUser) {
    const { companyId } = companyDto;

    const companyExist = await this.companyRepo.findOne({
      where: { _id: companyId },
    });
    if (!companyExist) throw new BadRequestException('Company not found');

    const usersFollow = companyExist.usersFollow || [];
    const userFollow = usersFollow.some((item) => item === user._id);

    if (userFollow) {
      throw new BadRequestException('User already follows company');
    }

    usersFollow.push(user._id);
    await this.companyRepo.update(companyId, { usersFollow });

    // Send notification to all HRs when user follows company
    const hrsInCompany = await this.usersService.findAllByCompanyId(companyId);
    if (hrsInCompany && hrsInCompany.length > 0) {
      for (const hr of hrsInCompany) {
        const notiObj: CreateNotificationDto = {
          userId: hr._id.toString(),
          title: 'Công ty của bạn có người theo dõi mới',
          content: `Người dùng ${user.name} đã theo dõi công ty của bạn.`,
          type: NotificationType.COMPANY,
          targetType: NotificationTargetType.COMPANY,
          targetId: companyId,
          data: { companyId },
        };
        this.notificationService.create(notiObj);
      }
    }

    return user._id;
  }

  async verifyCompany(companyId: string, requester: IUser) {
    if (requester.role !== Role.ADMIN) {
      throw new BadRequestException('Only admins can verify a company');
    }

    const { wasActive, isActive } = await this.dataSource.transaction(
      async (manager) => {
        const companyRepository = manager.getRepository(Company);
        const company = await companyRepository.findOne({
          where: { _id: companyId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!company || company._id?.toString() !== companyId.toString()) {
          throw new BadRequestException('Company not found');
        }

        const wasActive = company.isActive;
        const isActive = !wasActive;
        await companyRepository.update(companyId, { isActive });

        // Preserve the legacy JSONB snapshot for existing consumers. The
        // canonical company row remains authoritative to the index worker.
        const jobRepository = manager.getRepository(Job);
        const jobs = await jobRepository
          .createQueryBuilder('job')
          .where("job.company->>'_id' = :companyId", { companyId })
          .getMany();

        for (const job of jobs) {
          const updatedCompany = { ...job.company, isActive };
          await jobRepository.update(job._id, { company: updatedCompany });
        }

        // One company event is intentional: the dispatcher enumerates the
        // company jobs and avoids one duplicate outbox row per job.
        await this.aiIndexingService.enqueueWithNextSourceVersion(
          {
            aggregateType: AiIndexAggregateType.COMPANY,
            aggregateId: companyId,
            operation: AiIndexOutboxOperation.REINDEX_COMPANY,
          },
          manager,
        );

        return { wasActive, isActive };
      },
    );

    await this.redisService.invalidateCompaniesCache();

    // Notify all HRs in company after the transaction has committed.
    const hrsInCompany = await this.usersService.findAllByCompanyId(companyId);

    if (hrsInCompany && hrsInCompany.length > 0) {
      for (const hr of hrsInCompany) {
        const notiObj: CreateNotificationDto = {
          userId: hr._id.toString(),
          title: wasActive
            ? 'Công ty của bạn đã bị khóa'
            : 'Công ty của bạn đã được duyệt',
          content: wasActive
            ? 'Công ty của bạn đã bị khóa bởi quản trị viên. Vui lòng liên hệ để biết thêm chi tiết.'
            : 'Công ty của bạn đã được duyệt bởi quản trị viên. Bây giờ bạn có thể đăng tuyển dụng',
          type: NotificationType.COMPANY,
          targetType: NotificationTargetType.COMPANY,
          targetId: companyId,
          data: { companyId },
        };

        await this.notificationService.create(notiObj);
      }
    }

    return {
      message: 'Xác thực công ty thành công',
      isActive,
    };
  }

  async createByHr(createCompanyDto: CreateCompanyDto, user: IUser) {
    const companyExist = await this.companyRepo.findOne({
      where: { name: createCompanyDto.name },
    });

    if (companyExist) throw new BadRequestException('Company already exists');

    const newCompany = this.companyRepo.create({
      ...createCompanyDto,
      isActive: true,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    const savedCompany = await this.companyRepo.save(newCompany);
    await this.redisService.invalidateCompaniesCache();

    return savedCompany;
  }

  async unfollowCompany(companyDto: FollowCompanyDto, user: IUser) {
    const { companyId } = companyDto;

    const companyExist = await this.companyRepo.findOne({
      where: { _id: companyId },
    });
    if (!companyExist) throw new BadRequestException('Company not found');

    const usersFollow = (companyExist.usersFollow || []).filter(
      (item) => item !== user._id,
    );

    await this.companyRepo.update(companyId, { usersFollow });
    return user._id;
  }

  async findOne(id: string) {
    const company = await this.companyRepo.findOne({
      where: { _id: id, isActive: true, isDeleted: false },
    });

    if (!company) throw new NotFoundException('Company not found');

    const hrsInCompany = await this.getPublicCompanyHrs(id, company);

    const jobCount = await this.jobRepo
      .createQueryBuilder('job')
      .where("job.company->>'_id' = :companyId", { companyId: company._id })
      .andWhere('job.isDeleted = :isDeleted', { isDeleted: false })
      .getCount();

    return {
      ...this.toPublicCompanyResponse(company),
      hrs: hrsInCompany,
      hr: hrsInCompany && hrsInCompany.length > 0 ? hrsInCompany[0] : null,
      jobCount,
    };
  }

  async getCompanyHrs(companyId: string, user: IUser) {
    const company = await this.companyRepo.findOne({
      where: { _id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    this.assertCompanyRosterAccess(companyId, company, user);
    return this.getSanitizedCompanyHrs(companyId, company);
  }

  async findWithUserFollow(companyId: string) {
    const company = await this.companyRepo.findOne({
      where: { _id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    return company;
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto, user: IUser) {
    const userInDb = await this.usersService.findOneByEmail(user.email);
    const isAdmin = userInDb?.role === Role.ADMIN;

    if (!userInDb) {
      throw new BadRequestException('User not found');
    }

    if (!isAdmin) {
      const requesterCompanyId = userInDb.company?._id?.toString();
      if (!requesterCompanyId) {
        throw new BadRequestException('HR does not belong to any company');
      }

      if (requesterCompanyId !== id.toString()) {
        throw new BadRequestException(
          'You are not allowed to update this company',
        );
      }

      if (Object.prototype.hasOwnProperty.call(updateCompanyDto, 'isActive')) {
        throw new BadRequestException(
          'Only admins can change company activation status',
        );
      }
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const companyRepository = manager.getRepository(Company);
      const lockedCompany = await companyRepository.findOne({
        where: { _id: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedCompany || lockedCompany._id?.toString() !== id.toString()) {
        throw new BadRequestException('Company not found');
      }

      if (
        !isAdmin &&
        lockedCompany._id.toString() !== userInDb.company?._id?.toString()
      ) {
        throw new BadRequestException(
          'You are not allowed to update this company',
        );
      }

      const updateResult = await companyRepository.update(id, {
        ...updateCompanyDto,
        updatedBy: {
          _id: user._id,
          email: user.email,
        },
      });

      if (updateResult.affected !== 0) {
        await this.aiIndexingService.enqueueWithNextSourceVersion(
          {
            aggregateType: AiIndexAggregateType.COMPANY,
            aggregateId: id,
            operation: AiIndexOutboxOperation.REINDEX_COMPANY,
          },
          manager,
        );
      }

      return updateResult;
    });

    await this.redisService.invalidateCompaniesCache();
    return result;
  }

  async remove(id: string, user: IUser) {
    const userInDb = await this.usersService.findOneByEmail(user.email);

    if (!userInDb || userInDb.role !== Role.ADMIN) {
      throw new BadRequestException('Only admins can delete a company');
    }

    const deletedAt = new Date();
    const result = await this.dataSource.transaction(async (manager) => {
      const companyRepository = manager.getRepository(Company);
      const lockedCompany = await companyRepository.findOne({
        where: { _id: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedCompany || lockedCompany._id?.toString() !== id.toString()) {
        throw new BadRequestException('Company not found');
      }

      await companyRepository.update(id, {
        isDeleted: true,
        deletedAt,
        deletedBy: {
          _id: user._id,
          email: user.email,
        },
      });
      const softDeleteResult = await companyRepository.softDelete(id);
      await this.aiIndexingService.enqueueWithNextSourceVersion(
        {
          aggregateType: AiIndexAggregateType.COMPANY,
          aggregateId: id,
          operation: AiIndexOutboxOperation.REINDEX_COMPANY,
        },
        manager,
      );
      return softDeleteResult;
    });

    await this.redisService.invalidateCompaniesCache();
    return result;
  }

  async countCompanies() {
    return await this.companyRepo.count({ where: { isDeleted: false } });
  }

  // HR requests to join a company
  async requestJoinCompany(companyId: string, user: IUser) {
    const company = await this.companyRepo.findOne({
      where: { _id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    // Check if already a member
    const hrsInCompany = await this.usersService.findAllByCompanyId(companyId);
    if (hrsInCompany.some((hr) => hr._id.toString() === user._id.toString())) {
      throw new BadRequestException('Bạn đã là thành viên của công ty này');
    }

    // Check if already pending
    const pending = company.pendingHrs || [];
    if (pending.some((p) => p.userId === user._id.toString())) {
      throw new BadRequestException('Bạn đã gửi yêu cầu tham gia trước đó');
    }

    pending.push({
      userId: user._id.toString(),
      name: user.name,
      email: user.email,
      avatar: user.avatar || '',
      requestedAt: new Date(),
    });

    await this.companyRepo.update(companyId, { pendingHrs: pending });

    // Notify company creator
    const hrId = company.createdBy?._id?.toString();
    if (hrId) {
      const content = `${user.name} (${user.email}) muốn tham gia công ty ${company.name}. Hãy duyệt yêu cầu!`;
      await this.notificationService.create({
        userId: hrId,
        title: 'Yêu cầu tham gia công ty',
        content,
        type: NotificationType.COMPANY,
        targetType: NotificationTargetType.COMPANY,
        targetId: companyId,
        data: { companyId, requestUserId: user._id.toString() },
      });
    }

    return { message: 'Đã gửi yêu cầu tham gia công ty. Vui lòng chờ duyệt!' };
  }

  // Approve HR join request
  async approveHrRequest(companyId: string, userId: string, approver: IUser) {
    const company = await this.companyRepo.findOne({
      where: { _id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    this.assertCompanyCreator(
      companyId,
      company,
      approver,
      'Chỉ HR Trưởng (người tạo công ty) mới có quyền duyệt yêu cầu tham gia',
    );

    const pending = company.pendingHrs || [];
    const request = pending.find((p) => p.userId === userId);
    if (!request) {
      throw new BadRequestException('Không tìm thấy yêu cầu tham gia');
    }

    const updatedPending = pending.filter((p) => p.userId !== userId);
    await this.companyRepo.update(companyId, { pendingHrs: updatedPending });

    // Add user to company
    await this.usersService.updateUserCompany(userId, {
      _id: companyId,
      name: company.name,
      isActive: true,
    });

    // Notify the requesting user
    const content = `Bạn đã được duyệt tham gia công ty ${company.name}!`;
    const notiObj = {
      userId,
      title: 'Đã được duyệt vào công ty',
      content,
      type: NotificationType.COMPANY,
      targetType: NotificationTargetType.COMPANY,
      targetId: companyId,
      data: { companyId },
    };
    await this.notificationService.create(notiObj as CreateNotificationDto);

    return { message: `Đã duyệt ${request.name} vào công ty` };
  }

  // Reject HR join request
  async rejectHrRequest(companyId: string, userId: string, approver: IUser) {
    const company = await this.companyRepo.findOne({
      where: { _id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    this.assertCompanyCreator(
      companyId,
      company,
      approver,
      'Chỉ HR Trưởng (người tạo công ty) mới có quyền từ chối yêu cầu tham gia',
    );

    const pending = company.pendingHrs || [];
    const request = pending.find((p) => p.userId === userId);
    if (!request) {
      throw new BadRequestException('Không tìm thấy yêu cầu tham gia');
    }

    const updatedPending = pending.filter((p) => p.userId !== userId);
    await this.companyRepo.update(companyId, { pendingHrs: updatedPending });

    // Notify the requesting user
    const content = `Yêu cầu tham gia công ty ${company.name} đã bị từ chối.`;
    const notiObj = {
      userId,
      title: 'Yêu cầu tham gia bị từ chối',
      content,
      type: NotificationType.COMPANY,
      targetType: NotificationTargetType.NONE,
      data: { companyId },
    };
    await this.notificationService.create(notiObj as CreateNotificationDto);

    return { message: `Đã từ chối yêu cầu của ${request.name}` };
  }

  // Check if a user is the company creator
  async isCompanyCreator(companyId: string, userId: string): Promise<boolean> {
    const company = await this.companyRepo.findOne({
      where: { _id: companyId },
    });
    if (!company) return false;
    return company.createdBy?._id?.toString() === userId;
  }

  // Get pending HR requests for a company
  async getPendingHrs(companyId: string, user: IUser) {
    const company = await this.companyRepo.findOne({
      where: { _id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    if (user?.role !== Role.ADMIN) {
      const actorCompanyId = user?.company?._id?.toString();
      const isCompanyCreator =
        user?.role === Role.HR &&
        actorCompanyId === companyId.toString() &&
        company.createdBy?._id?.toString() === user?._id?.toString();

      if (!isCompanyCreator) {
        throw new BadRequestException(
          'Only the company creator or an admin can view pending HR requests',
        );
      }
    }

    return (company.pendingHrs || []).map((request) => ({
      userId: request.userId,
      name: request.name,
      email: request.email,
      avatar: request.avatar,
      requestedAt: request.requestedAt,
    }));
  }

  // Create company by HR (separate from registration)
  async createCompanyByHr(createCompanyDto: CreateCompanyDto, user: IUser) {
    const companyExist = await this.companyRepo.findOne({
      where: { name: createCompanyDto.name },
    });

    if (companyExist) throw new BadRequestException('Tên công ty đã tồn tại');

    const newCompany = this.companyRepo.create({
      ...createCompanyDto,
      isActive: true,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    const savedCompany = await this.companyRepo.save(newCompany);

    // Assign company to the HR user
    await this.usersService.updateUserCompany(user._id.toString(), {
      _id: savedCompany._id.toString(),
      name: savedCompany.name,
      isActive: true,
    });

    await this.redisService.invalidateCompaniesCache();

    // Notify all admins about the new company
    const admins = await this.usersService.findAllAdmins();
    if (admins && admins.length > 0) {
      const adminIds = admins.map((admin) => admin._id.toString());
      const title = 'Công ty mới được tạo';
      const content = `Công ty: ${savedCompany.name} đã được tạo bởi HR: ${user.name}. Duyệt ngay!`;
      await this.notificationService.createBulk(
        adminIds,
        title,
        content,
        NotificationType.COMPANY,
        NotificationTargetType.COMPANY,
        savedCompany._id.toString(),
        { companyId: savedCompany._id.toString() },
      );
    }

    return savedCompany;
  }

  // Get comprehensive HR dashboard statistics from PostgreSQL
  async getHrDashboardStats(user: IUser) {
    const userInDb = await this.usersService.findOneByEmail(user.email);
    if (!userInDb || !userInDb.company || !userInDb.company._id) {
      const isPrem = userInDb ? this.usersService.isHrPremium(userInDb) : false;
      return {
        hasCompany: false,
        isProfileComplete: false,
        isPremium: isPrem,
        premiumPlan: userInDb?.premiumPlan || 'FREE',
        premiumExpiresAt: userInDb?.premiumExpiresAt || null,
        company: null,
        stats: {
          totalJobs: 0,
          activeJobs: 0,
          todayJobsPostedCount: 0,
          maxActiveJobs: isPrem ? 999999 : 6,
          maxDailyJobs: isPrem ? 999999 : 6,
          totalApplications: 0,
          pendingApplications: 0,
          reviewingApplications: 0,
          approvedApplications: 0,
          rejectedApplications: 0,
          followersCount: 0,
          dailyApplicationStats: [],
          topJobs: [],
          recentApplications: [],
        },
      };
    }

    const companyId = userInDb.company._id;
    const company = await this.companyRepo.findOne({
      where: { _id: companyId, isDeleted: false },
    });

    if (!company) {
      const isPrem = this.usersService.isHrPremium(userInDb);
      return {
        hasCompany: false,
        isProfileComplete: false,
        isPremium: isPrem,
        premiumPlan: userInDb.premiumPlan || 'FREE',
        premiumExpiresAt: userInDb.premiumExpiresAt || null,
        company: null,
        stats: {
          totalJobs: 0,
          activeJobs: 0,
          todayJobsPostedCount: 0,
          maxActiveJobs: isPrem ? 999999 : 6,
          maxDailyJobs: isPrem ? 999999 : 6,
          totalApplications: 0,
          pendingApplications: 0,
          reviewingApplications: 0,
          approvedApplications: 0,
          rejectedApplications: 0,
          followersCount: 0,
          dailyApplicationStats: [],
          topJobs: [],
          recentApplications: [],
        },
      };
    }

    const isProfileComplete = Boolean(
      company.name &&
        company.taxCode &&
        company.scale &&
        company.address &&
        company.description &&
        company.logo,
    );

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    // Total jobs & active jobs & today jobs
    const allCompanyJobs = await this.jobRepo
      .createQueryBuilder('job')
      .where("job.company->>'_id' = :companyId", { companyId })
      .andWhere('job.isDeleted = :isDeleted', { isDeleted: false })
      .orderBy('job.createdAt', 'DESC')
      .getMany();

    const totalJobs = allCompanyJobs.length;
    const activeJobs = await this.activeJobQueryService
      .createActiveQuery(now)
      .andWhere("job.company->>'_id' = :companyId", { companyId })
      .getCount();
    const todayJobsPostedCount = allCompanyJobs.filter(
      (job) => new Date(job.createdAt) >= startOfToday,
    ).length;

    // Applications counts
    const applications = await this.applicationRepo
      .createQueryBuilder('app')
      .leftJoinAndSelect('app.job', 'job')
      .leftJoinAndSelect('app.user', 'user')
      .leftJoinAndSelect('app.cv', 'cv')
      .where('app.companyId = :companyId', { companyId })
      .andWhere('app.isDeleted = :isDeleted', { isDeleted: false })
      .orderBy('app.createdAt', 'DESC')
      .getMany();

    const totalApplications = applications.length;
    const pendingApplications = applications.filter(
      (app) => app.status === ApplicationStatus.PENDING,
    ).length;
    const reviewingApplications = applications.filter(
      (app) => app.status === ApplicationStatus.REVIEWING,
    ).length;
    const consideringApplications = applications.filter(
      (app) => app.status === ApplicationStatus.CONSIDERING,
    ).length;
    const approvedApplications = applications.filter(
      (app) => app.status === ApplicationStatus.APPROVED,
    ).length;
    const rejectedApplications = applications.filter(
      (app) => app.status === ApplicationStatus.REJECTED,
    ).length;

    // 7-day breakdown (from 6 days ago up to today)
    const dailyApplicationStats: {
      date: string;
      label: string;
      count: number;
    }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        23,
        59,
        59,
        999,
      );

      const count = applications.filter((app) => {
        const appDate = new Date(app.createdAt);
        return appDate >= dayStart && appDate <= dayEnd;
      }).length;

      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const dateStr = `${d.getFullYear()}-${month}-${day}`;

      dailyApplicationStats.push({
        date: dateStr,
        label: `${day}/${month}`,
        count,
      });
    }

    // Top jobs with application counts
    const jobAppCounts: Record<string, number> = {};
    applications.forEach((app) => {
      if (app.jobId) {
        jobAppCounts[app.jobId] = (jobAppCounts[app.jobId] || 0) + 1;
      }
    });

    const topJobs = allCompanyJobs
      .map((job) => ({
        _id: job._id,
        name: job.name,
        salary: job.salary,
        level: job.level,
        location: job.location,
        createdAt: job.createdAt,
        endDate: job.endDate,
        isActive: job.isActive,
        isHot: job.isHot || false,
        boostedAt: job.boostedAt || null,
        applicationsCount: jobAppCounts[job._id] || 0,
      }))
      .sort((a, b) => b.applicationsCount - a.applicationsCount)
      .slice(0, 5);

    // Recent 5 applications
    const recentApplications = applications.slice(0, 5).map((app) => ({
      _id: app._id,
      status: app.status,
      createdAt: app.createdAt,
      job: app.job
        ? { _id: app.job._id, name: app.job.name }
        : { _id: app.jobId, name: 'Vị trí đã đóng' },
      user: app.user
        ? {
            _id: app.user._id,
            name: app.user.name,
            email: app.user.email,
            avatar: app.user.avatar,
            address: app.user.address,
          }
        : null,
      cv: app.cv
        ? {
            _id: app.cv._id,
            title: app.cv.title,
            url: app.cv.url,
          }
        : null,
    }));

    const isPremium = this.usersService.isHrPremium(userInDb);
    const maxActiveJobs = this.usersService.getUserMaxActiveJobs(userInDb);
    const maxDailyJobs = maxActiveJobs;

    return {
      hasCompany: true,
      isProfileComplete,
      isPremium,
      premiumPlan: userInDb.premiumPlan || 'FREE',
      premiumExpiresAt: userInDb.premiumExpiresAt || null,
      company: {
        _id: company._id,
        name: company.name,
        description: company.description,
        address: company.address,
        logo: company.logo,
        taxCode: company.taxCode,
        scale: company.scale,
        isActive: company.isActive,
        usersFollow: company.usersFollow || [],
        createdAt: company.createdAt,
      },
      stats: {
        totalJobs,
        activeJobs,
        maxActiveJobs,
        todayJobsPostedCount,
        maxDailyJobs,
        totalApplications,
        pendingApplications,
        reviewingApplications,
        consideringApplications,
        approvedApplications,
        rejectedApplications,
        followersCount: company.usersFollow?.length || 0,
        dailyApplicationStats,
        topJobs,
        recentApplications,
      },
    };
  }
}

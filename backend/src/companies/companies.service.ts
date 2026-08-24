import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from './entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';
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

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,

    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,

    private readonly redisService: RedisService,

    private readonly notificationService: NotificationsService,

    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

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
      result: companies,
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
          ...company,
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

  async verifyCompany(companyId: string) {
    const companyExist = await this.companyRepo.findOne({
      where: { _id: companyId },
    });
    if (!companyExist) throw new BadRequestException('Company not found');

    const isAlreadyActive = companyExist.isActive;
    const newActiveStatus = !isAlreadyActive;

    await this.companyRepo.update(companyId, { isActive: newActiveStatus });

    // Update jobs belonging to this company with new isActive status
    const jobs = await this.jobRepo
      .createQueryBuilder('job')
      .where("job.company->>'_id' = :companyId", { companyId })
      .getMany();

    for (const job of jobs) {
      const updatedCompany = { ...job.company, isActive: newActiveStatus };
      await this.jobRepo.update(job._id, { company: updatedCompany });
    }

    await this.redisService.invalidateCompaniesCache();

    // Notify all HRs in company
    const hrsInCompany = await this.usersService.findAllByCompanyId(companyId);

    if (hrsInCompany && hrsInCompany.length > 0) {
      for (const hr of hrsInCompany) {
        const notiObj: CreateNotificationDto = {
          userId: hr._id.toString(),
          title: isAlreadyActive
            ? 'Công ty của bạn đã bị khóa'
            : 'Công ty của bạn đã được duyệt',
          content: isAlreadyActive
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
      isActive: newActiveStatus,
    };
  }

  async createByHr(createCompanyDto: CreateCompanyDto, user: IUser) {
    const companyExist = await this.companyRepo.findOne({
      where: { name: createCompanyDto.name },
    });

    if (companyExist) throw new BadRequestException('Company already exists');

    const newCompany = this.companyRepo.create({
      ...createCompanyDto,
      isActive: false,
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
    const company = await this.companyRepo.findOne({ where: { _id: id } });

    if (!company) throw new NotFoundException('Company not found');

    const hrsInCompany = await this.usersService.findAllByCompanyId(id);

    const jobCount = await this.jobRepo
      .createQueryBuilder('job')
      .where("job.company->>'_id' = :companyId", { companyId: company._id })
      .andWhere('job.isDeleted = :isDeleted', { isDeleted: false })
      .getCount();

    return {
      ...company,
      hrs: hrsInCompany,
      hr: hrsInCompany && hrsInCompany.length > 0 ? hrsInCompany[0] : null,
      jobCount,
    };
  }

  async getCompanyHrs(companyId: string) {
    const company = await this.companyRepo.findOne({
      where: { _id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    return await this.usersService.findAllByCompanyId(companyId);
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

    if (
      userInDb.role !== Role.ADMIN &&
      userInDb.company &&
      userInDb.company._id.toString() !== id
    ) {
      throw new BadRequestException(
        'You are not allowed to update this company',
      );
    }

    const result = await this.companyRepo.update(id, {
      ...updateCompanyDto,
      updatedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    await this.redisService.invalidateCompaniesCache();
    return result;
  }

  async remove(id: string, user: IUser) {
    const userInDb = await this.usersService.findOneByEmail(user.email);

    if (userInDb.role !== Role.ADMIN) {
      if (userInDb.company && userInDb.company._id.toString() !== id) {
        throw new BadRequestException(
          'You are not allowed to delete this company',
        );
      }
    }

    const company = await this.companyRepo.findOne({ where: { _id: id } });
    if (!company) throw new BadRequestException('Company not found');

    await this.companyRepo.update(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    await this.redisService.invalidateCompaniesCache();
    return await this.companyRepo.softDelete(id);
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

    if (company.createdBy?._id?.toString() !== approver._id.toString()) {
      throw new BadRequestException(
        'Chỉ người tạo công ty mới có quyền duyệt yêu cầu tham gia',
      );
    }

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

    if (company.createdBy?._id?.toString() !== approver._id.toString()) {
      throw new BadRequestException(
        'Chỉ người tạo công ty mới có quyền từ chối yêu cầu tham gia',
      );
    }

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
  async getPendingHrs(companyId: string) {
    const company = await this.companyRepo.findOne({
      where: { _id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    return company.pendingHrs || [];
  }

  // Create company by HR (separate from registration)
  async createCompanyByHr(createCompanyDto: CreateCompanyDto, user: IUser) {
    const companyExist = await this.companyRepo.findOne({
      where: { name: createCompanyDto.name },
    });

    if (companyExist) throw new BadRequestException('Tên công ty đã tồn tại');

    const newCompany = this.companyRepo.create({
      ...createCompanyDto,
      isActive: false,
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
}

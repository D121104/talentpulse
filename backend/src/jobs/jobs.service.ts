import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  Repository,
  MoreThan,
  LessThanOrEqual,
  MoreThanOrEqual,
  Between,
} from 'typeorm';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { Job } from './entities/job.entity';
import aqp from 'api-query-params';
import { IUser } from 'src/users/users.interface';
import { Role } from 'src/decorator/customize';
import { UsersService } from 'src/users/users.service';
import { RedisService } from 'src/redis/redis.service';
import { Company } from 'src/companies/entities/company.entity';
import { Application } from 'src/applications/entities/application.entity';
import { NotificationsService } from 'src/notifications/notifications.service';
import {
  NotificationTargetType,
  NotificationType,
} from 'src/notifications/entities/notification.entity';
import { CVProcessingService } from 'src/ai-matching/cv-processing.service';
import { ActiveJobQueryService } from 'src/active-jobs/active-job-query.service';
import {
  AiIndexAggregateType,
  AiIndexOutboxOperation,
} from 'src/ai-indexing/entities';
import { AiIndexingService } from 'src/ai-indexing/ai-indexing.service';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,

    private readonly redisService: RedisService,

    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,

    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,

    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,

    private readonly notificationsService: NotificationsService,

    private readonly cvProcessingService: CVProcessingService,

    private readonly activeJobQueryService: ActiveJobQueryService,

    private readonly dataSource: DataSource,

    private readonly aiIndexingService: AiIndexingService,
  ) {}

  async getAll() {
    return await this.activeJobQueryService.createActiveQuery().getMany();
  }

  async getJobsByHr(user: IUser, qs: any) {
    const userInDb = await this.usersService.findOneByEmail(user.email);

    if (!userInDb.company) {
      throw new BadRequestException('HR does not belong to any company');
    }

    const companyInDb = await this.companyRepo.findOne({
      where: { _id: userInDb.company._id },
    });

    if (!companyInDb) {
      throw new BadRequestException('Company not found');
    }

    if (!companyInDb.isActive) {
      throw new BadRequestException('Company is not active');
    }

    const { filter, sort } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;

    const limit = qs.pageSize ? parseInt(qs.pageSize) : 10;
    const current = qs.current ? parseInt(qs.current) : 1;
    const skip = (current - 1) * limit;

    const queryBuilder = this.activeJobQueryService
      .createNonDeletedQuery()
      .andWhere("job.company->>'_id' = :companyId", {
        companyId: companyInDb._id,
      });

    if (sort) {
      for (const [key, value] of Object.entries(sort)) {
        queryBuilder.addOrderBy(
          `job.${key}`,
          (value as number) === 1 ? 'ASC' : 'DESC',
        );
      }
    } else {
      queryBuilder
        .orderBy('job.isHot', 'DESC')
        .addOrderBy('job.boostedAt', 'DESC', 'NULLS LAST')
        .addOrderBy('job.createdAt', 'DESC');
    }

    const [jobs, totalRecord] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPage = Math.ceil(totalRecord / limit);

    const jobsWithApplicationsCount = await Promise.all(
      jobs.map(async (job) => {
        const applications = await this.applicationRepo.count({
          where: { jobId: job._id, isDeleted: false },
        });
        return {
          ...job,
          applicationsCount: applications,
        };
      }),
    );

    return {
      meta: {
        current,
        pageSize: limit,
        pages: totalPage,
        total: totalRecord,
      },
      result: jobsWithApplicationsCount,
    };
  }

  async searchJobsByHr(user: IUser, name: string, qs: any) {
    const userInDb = await this.usersService.findOneByEmail(user.email);

    if (!userInDb.company) {
      throw new BadRequestException('HR does not belong to any company');
    }

    const companyInDb = await this.companyRepo.findOne({
      where: { _id: userInDb.company._id },
    });

    if (!companyInDb) {
      throw new BadRequestException('Company not found');
    }

    if (!companyInDb.isActive) {
      throw new BadRequestException('Company is not active');
    }

    const { filter, sort } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;

    const limit = qs.pageSize ? parseInt(qs.pageSize) : 10;
    const current = qs.current ? parseInt(qs.current) : 1;
    const skip = (current - 1) * limit;

    const queryBuilder = this.activeJobQueryService
      .createNonDeletedQuery()
      .andWhere("job.company->>'_id' = :companyId", {
        companyId: companyInDb._id,
      });

    if (name && name.trim()) {
      queryBuilder.andWhere('job.name ILIKE :name', {
        name: `%${name.trim()}%`,
      });
    }

    if (sort) {
      for (const [key, value] of Object.entries(sort)) {
        queryBuilder.addOrderBy(
          `job.${key}`,
          (value as number) === 1 ? 'ASC' : 'DESC',
        );
      }
    } else {
      queryBuilder
        .orderBy('job.isHot', 'DESC')
        .addOrderBy('job.boostedAt', 'DESC', 'NULLS LAST')
        .addOrderBy('job.createdAt', 'DESC');
    }

    const [jobs, totalRecord] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPage = Math.ceil(totalRecord / limit);

    const jobsWithApplicationsCount = await Promise.all(
      jobs.map(async (job) => {
        const applications = await this.applicationRepo.count({
          where: { jobId: job._id, isDeleted: false },
        });
        return {
          ...job,
          applicationsCount: applications,
        };
      }),
    );

    return {
      meta: {
        current,
        pageSize: limit,
        pages: totalPage,
        total: totalRecord,
      },
      result: jobsWithApplicationsCount,
    };
  }

  // Create a new job posting. Validates HR's company, then notifies all followers.
  async create(createJobDto: CreateJobDto, user: IUser) {
    const userInDb = await this.usersService.findOneByEmail(user.email);

    if (
      userInDb.company &&
      createJobDto.company._id.toString() !== userInDb.company._id.toString()
    ) {
      throw new BadRequestException(
        `Please create job of company ${userInDb.company.name}`,
      );
    }

    const company = await this.companyRepo.findOne({
      where: { _id: createJobDto.company._id },
    });

    if (!company) {
      throw new BadRequestException('Company not found');
    }

    if (!company.isActive) {
      throw new BadRequestException('Company is not active');
    }

    // Enforce active jobs limit (6 concurrent active jobs for Standard Free HR, unlimited for HR Premium & Admin)
    const isHrPrem = this.usersService.isHrPremium(userInDb);
    const maxActiveJobs = this.usersService.getUserMaxActiveJobs(userInDb);

    if (!isHrPrem && user.role !== Role.ADMIN) {
      const now = new Date();
      const activeJobsCount = await this.activeJobQueryService
        .createActiveQuery(now)
        .andWhere("job.company->>'_id' = :companyId", {
          companyId: company._id,
        })
        .getCount();

      if (activeJobsCount >= maxActiveJobs) {
        throw new BadRequestException(
          `Tài khoản HR miễn phí chỉ được có tối đa ${maxActiveJobs} tin tuyển dụng đang hoạt động cùng lúc (còn hạn tuyển dụng và chưa bị xóa). Vui lòng đóng/xóa bớt tin cũ hoặc nâng cấp gói HR Premium để đăng tin không giới hạn!`,
        );
      }
    }

    createJobDto.company = {
      _id: company._id,
      name: company.name,
      logo: company.logo,
      isActive: company.isActive,
    };

    const savedJob = await this.dataSource.transaction(async (manager) => {
      const jobRepository = manager.getRepository(Job);
      const newJob = jobRepository.create({
        ...createJobDto,
        createdBy: {
          _id: user._id,
          email: user.email,
        },
      });
      const createdJob = await jobRepository.save(newJob);

      await this.aiIndexingService.enqueueWithNextSourceVersion(
        {
          aggregateType: AiIndexAggregateType.JOB,
          aggregateId: createdJob._id,
          operation: AiIndexOutboxOperation.UPSERT,
        },
        manager,
      );

      return createdJob;
    });

    // Post-commit side effects are deliberately outside the business transaction.
    // A notification/cache failure cannot roll back the persisted job/outbox.
    await this.notifyNewJobFollowers(company, savedJob);
    await this.redisService.invalidateJobsCache();

    return savedJob;
  }

  private async notifyNewJobFollowers(
    company: Company,
    savedJob: Job,
  ): Promise<void> {
    if (!company.usersFollow || company.usersFollow.length === 0) return;

    await this.notificationsService.createBulk(
      company.usersFollow,
      'Công ty ' + company.name + ' vừa đăng tuyển công việc mới',
      `Công việc ${savedJob.name} với mức lương ${savedJob.salary} VND đã được đăng tuyển. Hãy nhanh tay ứng tuyển ngay!`,
      NotificationType.JOB,
      NotificationTargetType.JOB,
      savedJob._id.toString(),
      { jobId: savedJob._id.toString(), companyId: company._id.toString() },
    );
  }

  async findAll(qs: any) {
    try {
      const salaryFilter: any = {};
      if (qs.salary && typeof qs.salary === 'object') {
        if (qs.salary.lt) salaryFilter.lt = Number(qs.salary.lt);
        if (qs.salary.lte) salaryFilter.lte = Number(qs.salary.lte);
        if (qs.salary.gt) salaryFilter.gt = Number(qs.salary.gt);
        if (qs.salary.gte) salaryFilter.gte = Number(qs.salary.gte);
        delete qs.salary;
      }

      const { filter, sort } = aqp(qs);
      delete filter.current;
      delete filter.pageSize;
      delete filter.companyName;

      let currentUser = null;
      if (filter.email) {
        currentUser = await this.usersService.findOneByEmail(filter.email);
      }

      const limit = qs.pageSize ? parseInt(qs.pageSize) : 10;
      const current = qs.current ? parseInt(qs.current) : 1;
      const skip = (current - 1) * limit;

      const queryBuilder = this.activeJobQueryService.createActiveQuery();

      if (currentUser && currentUser.company) {
        queryBuilder.andWhere("job.company->>'_id' = :companyId", {
          companyId: currentUser.company._id,
        });
      } else if (filter.companyId) {
        queryBuilder.andWhere("job.company->>'_id' = :companyId", {
          companyId: filter.companyId,
        });
      }

      if (filter.name) {
        queryBuilder.andWhere('job.name ILIKE :name', {
          name: `%${filter.name}%`,
        });
      }

      if (filter.location) {
        queryBuilder.andWhere('job.location ILIKE :location', {
          location: `%${filter.location}%`,
        });
      }

      if (filter.level) {
        queryBuilder.andWhere('job.level = :level', { level: filter.level });
      }

      // Handle salary conditions
      if (salaryFilter.gte !== undefined && salaryFilter.lte !== undefined) {
        queryBuilder.andWhere('job.salary BETWEEN :minSalary AND :maxSalary', {
          minSalary: salaryFilter.gte,
          maxSalary: salaryFilter.lte,
        });
      } else if (salaryFilter.gte !== undefined) {
        queryBuilder.andWhere('job.salary >= :minSalary', {
          minSalary: salaryFilter.gte,
        });
      } else if (salaryFilter.gt !== undefined) {
        queryBuilder.andWhere('job.salary > :minSalary', {
          minSalary: salaryFilter.gt,
        });
      } else if (salaryFilter.lte !== undefined) {
        queryBuilder.andWhere('job.salary <= :maxSalary', {
          maxSalary: salaryFilter.lte,
        });
      } else if (salaryFilter.lt !== undefined) {
        queryBuilder.andWhere('job.salary < :maxSalary', {
          maxSalary: salaryFilter.lt,
        });
      }

      if (sort) {
        for (const [key, value] of Object.entries(sort)) {
          queryBuilder.addOrderBy(
            `job.${key}`,
            (value as number) === 1 ? 'ASC' : 'DESC',
          );
        }
      } else {
        queryBuilder
          .orderBy('job.isHot', 'DESC')
          .addOrderBy('job.boostedAt', 'DESC', 'NULLS LAST')
          .addOrderBy('job.createdAt', 'DESC');
      }

      const [jobs, totalRecord] = await queryBuilder
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      const totalPage = Math.ceil(totalRecord / limit);

      return {
        meta: {
          current,
          pageSize: limit,
          pages: totalPage,
          total: totalRecord,
        },
        result: jobs,
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async findJobsBySkillName(names: string[]) {
    if (!names || names.length === 0) return [];

    // Check if any job skill array contains any of names (case-insensitive)
    const queryBuilder = this.activeJobQueryService.createActiveQuery();

    const conditions = names.map(
      (name, idx) =>
        `EXISTS (SELECT 1 FROM unnest(job.skills) s WHERE s ILIKE :skill${idx})`,
    );
    const params: Record<string, string> = {};
    names.forEach((name, idx) => {
      params[`skill${idx}`] = `%${name}%`;
    });

    queryBuilder.andWhere(`(${conditions.join(' OR ')})`, params);

    return await queryBuilder.getMany();
  }

  async findOne(id: string) {
    const job = await this.activeJobQueryService.findActiveById(id);

    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  /**
   * Internal lookup for authenticated HR/admin workflows. This must not be
   * used by public candidate reads because it intentionally includes jobs
   * outside their active date window.
   */
  async findOneForInternal(id: string) {
    const job = await this.activeJobQueryService.findNonDeletedById(id);

    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  async update(id: string, updateJobDto: UpdateJobDto, user: IUser) {
    const userInDb = await this.usersService.findOneByEmail(user.email);

    if (
      userInDb.company &&
      updateJobDto.company &&
      updateJobDto.company._id.toString() !== userInDb.company._id.toString()
    ) {
      throw new BadRequestException(
        `Please update job of company ${userInDb.company.name}`,
      );
    }

    const currentJob = await this.activeJobQueryService.findNonDeletedById(id);
    if (!currentJob) {
      throw new NotFoundException('Job not found');
    }

    if (updateJobDto.company?._id) {
      const company = await this.companyRepo.findOne({
        where: { _id: updateJobDto.company._id },
      });

      if (!company) {
        throw new BadRequestException('Company not found');
      }

      if (!company.isActive) {
        throw new BadRequestException('Company is not active');
      }

      updateJobDto.company = {
        _id: company._id,
        name: company.name,
        logo: company.logo,
        isActive: company.isActive,
      };
    }

    const { result, updatedJob, descriptionChanged } =
      await this.dataSource.transaction(async (manager) => {
        const jobRepository = manager.getRepository(Job);
        const lockedJob = await jobRepository.findOne({
          where: { _id: id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!lockedJob || lockedJob.isDeleted || lockedJob.deletedAt) {
          throw new NotFoundException('Job not found');
        }

        const descriptionChanged =
          updateJobDto.description !== undefined &&
          updateJobDto.description !== lockedJob.description;

        const result = await jobRepository.update(id, {
          ...updateJobDto,
          updatedBy: {
            _id: user._id,
            email: user.email,
          },
        });
        await this.aiIndexingService.enqueueWithNextSourceVersion(
          {
            aggregateType: AiIndexAggregateType.JOB,
            aggregateId: id,
            operation: AiIndexOutboxOperation.UPSERT,
          },
          manager,
        );

        return {
          result,
          updatedJob: await jobRepository.findOne({ where: { _id: id } }),
          descriptionChanged,
        };
      });

    await this.redisService.invalidateJobsCache();

    // Re-process all CVs only when description has changed. This is a
    // post-commit best-effort side effect, matching the existing behavior.
    if (descriptionChanged && updatedJob) {
      await this.cvProcessingService.reprocessAllCVsForJob(id, {
        name: updatedJob.name,
        description: updatedJob.description,
        skills: updatedJob.skills || [],
        level: updatedJob.level,
      });
    }

    return result;
  }

  async remove(id: string, user: IUser) {
    const userInDb = await this.usersService.findOneByEmail(user.email);

    const job = await this.activeJobQueryService.findNonDeletedById(id);
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (
      userInDb.company &&
      job.company._id.toString() !== userInDb.company._id.toString()
    ) {
      throw new BadRequestException(
        `Please delete job of company ${job.company.name}`,
      );
    }

    const deletedAt = new Date();
    const result = await this.dataSource.transaction(async (manager) => {
      const jobRepository = manager.getRepository(Job);
      const lockedJob = await jobRepository.findOne({
        where: { _id: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedJob || lockedJob.isDeleted || lockedJob.deletedAt) {
        throw new NotFoundException('Job not found');
      }

      await jobRepository.update(id, {
        isDeleted: true,
        deletedAt,
        deletedBy: {
          _id: user._id,
          email: user.email,
        },
      });
      const softDeleteResult = await jobRepository.softDelete(id);
      await this.aiIndexingService.enqueueWithNextSourceVersion(
        {
          aggregateType: AiIndexAggregateType.JOB,
          aggregateId: id,
          operation: AiIndexOutboxOperation.DELETE,
        },
        manager,
      );
      return softDeleteResult;
    });

    await this.redisService.invalidateJobsCache();
    return result;
  }

  async boostJob(id: string, user: IUser) {
    const userInDb = await this.usersService.findOneByEmail(user.email);
    if (!userInDb) {
      throw new NotFoundException('User not found');
    }

    const isHrPrem = this.usersService.isHrPremium(userInDb);
    if (!isHrPrem && user.role !== Role.ADMIN) {
      throw new BadRequestException(
        'Tính năng đẩy TOP tin tuyển dụng chỉ dành riêng cho tài khoản HR Premium. Vui lòng nâng cấp gói HR Premium để sử dụng tính năng này!',
      );
    }

    const job = await this.activeJobQueryService.findNonDeletedById(id);
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (
      userInDb.company &&
      user.role !== Role.ADMIN &&
      job.company?._id?.toString() !== userInDb.company._id?.toString()
    ) {
      throw new BadRequestException(
        'Bạn chỉ có thể đẩy TOP tin tuyển dụng thuộc công ty của mình.',
      );
    }

    const now = new Date();

    const savedJob = await this.dataSource.transaction(async (manager) => {
      const jobRepository = manager.getRepository(Job);
      const lockedJob = await jobRepository.findOne({
        where: { _id: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedJob || lockedJob.isDeleted || lockedJob.deletedAt) {
        throw new NotFoundException('Job not found');
      }

      // `updatedAt` is part of the current canonical index payload, so a
      // boost needs a fresh UPSERT even though searchable content is unchanged.
      lockedJob.isHot = true;
      lockedJob.boostedAt = now;
      lockedJob.updatedAt = now;
      const saved = await jobRepository.save(lockedJob);
      await this.aiIndexingService.enqueueWithNextSourceVersion(
        {
          aggregateType: AiIndexAggregateType.JOB,
          aggregateId: id,
          operation: AiIndexOutboxOperation.UPSERT,
        },
        manager,
      );
      return saved;
    });
    await this.redisService.invalidateJobsCache();

    return {
      message:
        'Đã đẩy TOP tin tuyển dụng thành công! Tin của bạn sẽ được ưu tiên hiển thị đầu trang với nhãn HOT nổi bật.',
      job: savedJob,
    };
  }

  async countJobs() {
    return await this.activeJobQueryService.createActiveQuery().getCount();
  }
}

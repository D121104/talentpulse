import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
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
  ) {}

  async getAll() {
    return await this.jobRepo.find({ where: { isDeleted: false } });
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

    const queryBuilder = this.jobRepo
      .createQueryBuilder('job')
      .where("job.company->>'_id' = :companyId", { companyId: companyInDb._id })
      .andWhere('job.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('job.endDate > :now', { now: new Date() });

    if (sort) {
      for (const [key, value] of Object.entries(sort)) {
        queryBuilder.addOrderBy(
          `job.${key}`,
          (value as number) === 1 ? 'ASC' : 'DESC',
        );
      }
    } else {
      queryBuilder.orderBy('job.createdAt', 'DESC');
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

    const queryBuilder = this.jobRepo
      .createQueryBuilder('job')
      .where("job.company->>'_id' = :companyId", { companyId: companyInDb._id })
      .andWhere('job.isDeleted = :isDeleted', { isDeleted: false });

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
      queryBuilder.orderBy('job.createdAt', 'DESC');
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

    // Enforce daily quota limit (5 jobs/day for Standard Free HR, unlimited for HR Premium & Admin)
    const isHrPrem = this.usersService.isHrPremium(userInDb);
    const maxDailyJobs = this.usersService.getUserMaxDailyJobs(userInDb);

    if (!isHrPrem && user.role !== Role.ADMIN) {
      const now = new Date();
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );

      const todayJobsCount = await this.jobRepo
        .createQueryBuilder('job')
        .where("job.company->>'_id' = :companyId", { companyId: company._id })
        .andWhere('job.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('job.createdAt >= :startOfToday', { startOfToday })
        .getCount();

      if (todayJobsCount >= maxDailyJobs) {
        throw new BadRequestException(
          `Bạn đã đạt giới hạn tối đa ${maxDailyJobs} tin tuyển dụng/ngày đối với tài khoản miễn phí. Vui lòng nâng cấp gói HR Premium để đăng tin không giới hạn!`,
        );
      }
    }

    createJobDto.company = {
      _id: company._id,
      name: company.name,
      logo: company.logo,
      isActive: company.isActive,
    };

    const newJob = this.jobRepo.create({
      ...createJobDto,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    const savedJob = await this.jobRepo.save(newJob);

    // Send notification to all users following this company about the new job
    if (company.usersFollow && company.usersFollow.length > 0) {
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

    await this.redisService.invalidateJobsCache();

    return savedJob;
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

      const queryBuilder = this.jobRepo
        .createQueryBuilder('job')
        .where('job.isDeleted = :isDeleted', { isDeleted: false });

      if (currentUser && currentUser.company) {
        queryBuilder.andWhere("job.company->>'_id' = :companyId", {
          companyId: currentUser.company._id,
        });
      } else if (filter.companyId) {
        queryBuilder.andWhere("job.company->>'_id' = :companyId", {
          companyId: filter.companyId,
        });
      } else {
        queryBuilder.andWhere("(job.company->>'isActive')::boolean = true");
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
        queryBuilder.orderBy('job.createdAt', 'DESC');
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
    const queryBuilder = this.jobRepo
      .createQueryBuilder('job')
      .where('job.isDeleted = :isDeleted', { isDeleted: false });

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
    const job = await this.jobRepo.findOne({
      where: { _id: id, isDeleted: false },
    });

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

    const currentJob = await this.jobRepo.findOne({ where: { _id: id } });
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

    const descriptionChanged =
      updateJobDto.description !== undefined &&
      updateJobDto.description !== currentJob.description;

    await this.redisService.invalidateJobsCache();

    const result = await this.jobRepo.update(id, {
      ...updateJobDto,
      updatedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    // Re-process all CVs only when description has changed
    if (descriptionChanged) {
      const updatedJob = await this.jobRepo.findOne({ where: { _id: id } });
      if (updatedJob) {
        await this.cvProcessingService.reprocessAllCVsForJob(id, {
          name: updatedJob.name,
          description: updatedJob.description,
          skills: updatedJob.skills || [],
          level: updatedJob.level,
        });
      }
    }

    return result;
  }

  async remove(id: string, user: IUser) {
    const userInDb = await this.usersService.findOneByEmail(user.email);

    const job = await this.jobRepo.findOne({ where: { _id: id } });
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

    await this.jobRepo.update(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    await this.redisService.invalidateJobsCache();
    return await this.jobRepo.softDelete(id);
  }

  async countJobs() {
    return await this.jobRepo.count({ where: { isDeleted: false } });
  }
}

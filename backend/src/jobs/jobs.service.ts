import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
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
import { UserCV } from 'src/usercvs/entities/usercv.entity';
import { OnlineCV } from 'src/online-cvs/entities/online-cv.entity';
import { NotificationsService } from 'src/notifications/notifications.service';
import {
  NotificationTargetType,
  NotificationType,
} from 'src/notifications/entities/notification.entity';
import { CVProcessingService } from 'src/ai-matching/cv-processing.service';
import { ActiveJobQueryService } from 'src/active-jobs/active-job-query.service';
import { ElasticsearchService } from 'src/elasticsearch/elasticsearch.service';
import { JobSyncPayload } from 'src/elasticsearch/job-sync.processor';

export function getIsoWeekString(d: Date = new Date()): string {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNumber =
    1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  return `${d.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

export function applyCompanyDiversity(
  jobs: any[],
  maxPerCompanyInFirstSlide = 2,
  maxTotalPerCompany = 3,
): any[] {
  const result: any[] = [];
  const companyCounts = new Map<string, number>();
  const deferredJobs: any[] = [];

  for (const job of jobs) {
    const companyId = job.company?._id || 'unknown';
    const currentCount = companyCounts.get(companyId) || 0;

    if (result.length < 9) {
      if (currentCount < maxPerCompanyInFirstSlide) {
        result.push(job);
        companyCounts.set(companyId, currentCount + 1);
      } else {
        deferredJobs.push(job);
      }
    } else {
      if (currentCount < maxTotalPerCompany) {
        result.push(job);
        companyCounts.set(companyId, currentCount + 1);
      } else {
        deferredJobs.push(job);
      }
    }
  }

  for (const job of deferredJobs) {
    const companyId = job.company?._id || 'unknown';
    const currentCount = companyCounts.get(companyId) || 0;
    if (currentCount < maxTotalPerCompany) {
      result.push(job);
      companyCounts.set(companyId, currentCount + 1);
    }
  }

  return result;
}

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

    @InjectRepository(UserCV)
    private readonly userCvRepo: Repository<UserCV>,

    @InjectRepository(OnlineCV)
    private readonly onlineCvRepo: Repository<OnlineCV>,

    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,

    private readonly notificationsService: NotificationsService,

    private readonly cvProcessingService: CVProcessingService,

    private readonly activeJobQueryService: ActiveJobQueryService,

    private readonly elasticsearchService: ElasticsearchService,

    @Optional()
    @InjectQueue('job-sync-es')
    private readonly jobSyncQueue?: Queue<JobSyncPayload>,
  ) {}

  private async enqueueJobSync(
    jobId: string,
    action: 'sync-job' | 'delete-job' = 'sync-job',
  ): Promise<void> {
    try {
      if (this.jobSyncQueue) {
        await this.jobSyncQueue.add(
          action,
          { jobId },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
          },
        );
      } else {
        // Direct sync fallback if queue disabled
        if (action === 'sync-job') {
          const job = await this.jobRepo.findOne({ where: { _id: jobId } });
          if (job) await this.elasticsearchService.indexJob(job);
        } else {
          await this.elasticsearchService.deleteJob(jobId);
        }
      }
    } catch {
      // Ignore queue dispatch error to keep HTTP request robust
    }
  }

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

    const newJob = this.jobRepo.create({
      ...createJobDto,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    const savedJob = await this.jobRepo.save(newJob);

    // Sync to Elasticsearch
    void this.enqueueJobSync(savedJob._id);

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

    // Sync to Elasticsearch
    void this.enqueueJobSync(id);

    // Re-process all CVs only when description has changed
    if (descriptionChanged) {
      const updatedJob = await this.activeJobQueryService.findNonDeletedById(id);
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

    await this.jobRepo.update(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    await this.redisService.invalidateJobsCache();
    // Remove from Elasticsearch
    void this.enqueueJobSync(id, 'delete-job');

    return await this.jobRepo.softDelete(id);
  }

  async boostJob(id: string, user: IUser) {
    const userInDb = await this.usersService.findOneByEmail(user.email);
    if (!userInDb) {
      throw new NotFoundException('User not found');
    }

    const isHrPrem = this.usersService.isHrPremium(userInDb);
    const now = new Date();

    // Check & Enforce Boost Quota:
    // HR Premium / Admin: 5 boosts per day
    // HR Standard: 2 boosts per week
    if (isHrPrem || user.role === Role.ADMIN) {
      const dayKey = `hr_boost:${userInDb._id}:day:${now.toISOString().slice(0, 10)}`;
      const usedToday =
        Number(await this.redisService.getValue<number>(dayKey)) || 0;
      if (usedToday >= 5 && user.role !== Role.ADMIN) {
        throw new BadRequestException(
          'Bạn đã sử dụng hết hạn mức đẩy TOP tin tuyển dụng hôm nay (5 tin/ngày). Vui lòng quay lại vào ngày mai!',
        );
      }
      await this.redisService.setValue(dayKey, usedToday + 1, 48 * 3600);
    } else {
      const weekKey = `hr_boost:${userInDb._id}:week:${getIsoWeekString(now)}`;
      const usedThisWeek =
        Number(await this.redisService.getValue<number>(weekKey)) || 0;
      if (usedThisWeek >= 2) {
        throw new BadRequestException(
          'Bạn đã sử dụng hết hạn mức đẩy TOP tin tuyển dụng tuần này (2 tin/tuần). Vui lòng nâng cấp gói HR Premium để được đẩy 5 tin/ngày!',
        );
      }
      await this.redisService.setValue(weekKey, usedThisWeek + 1, 8 * 24 * 3600);
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

    // HOT duration = 1 day (24 hours)
    job.isHot = true;
    job.boostedAt = now;
    job.boostExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    job.updatedAt = now;

    const savedJob = await this.jobRepo.save(job);
    await this.redisService.invalidateJobsCache();

    // Sync to Elasticsearch
    void this.enqueueJobSync(job._id);

    return {
      message:
        'Đã đẩy TOP tin tuyển dụng thành công (hiệu lực 24 giờ)! Tin của bạn sẽ được ưu tiên xuất hiện tại các vị trí nổi bật.',
      job: savedJob,
    };
  }

  async getLandingPopularJobs(options: {
    user?: IUser | null;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(options.limit) || 9));

    let candidateSkills: string[] = [];
    const userId = options.user?._id;

    if (userId && options.user?.role === 'USER') {
      const cacheKey = `user:${userId}:primary-cv-skills`;
      const cachedSkills = await this.redisService.getValue<string[]>(cacheKey);

      if (Array.isArray(cachedSkills) && cachedSkills.length > 0) {
        candidateSkills = cachedSkills;
      } else {
        // 1. Check uploaded CVs (user_cvs)
        const primaryCv = await this.userCvRepo.findOne({
          where: { userId, isDeleted: false },
          order: { isPrimary: 'DESC', createdAt: 'DESC' },
        });

        if (
          primaryCv &&
          Array.isArray(primaryCv.skills) &&
          primaryCv.skills.length > 0
        ) {
          candidateSkills = primaryCv.skills;
        } else {
          // 2. Check Online CVs (online_cvs)
          const onlineCv = await this.onlineCvRepo.findOne({
            where: { userId, isDeleted: false },
            order: { isPrimary: 'DESC', createdAt: 'DESC' },
          });

          if (onlineCv) {
            const extractedSkills: string[] = [];
            if (Array.isArray(onlineCv.skills)) {
              for (const s of onlineCv.skills) {
                if (typeof s === 'string' && (s as string).trim()) {
                  extractedSkills.push((s as string).trim());
                } else if (s && typeof s === 'object' && s.name) {
                  extractedSkills.push(s.name.trim());
                }
              }
            }
            if (onlineCv.position && onlineCv.position.trim()) {
              extractedSkills.push(onlineCv.position.trim());
            }
            if (onlineCv.title && onlineCv.title.trim()) {
              extractedSkills.push(onlineCv.title.trim());
            }

            if (extractedSkills.length > 0) {
              candidateSkills = Array.from(new Set(extractedSkills));
            }
          }
        }

        if (candidateSkills.length > 0) {
          await this.redisService.setValue(cacheKey, candidateSkills, 900); // 15 min TTL
        }
      }
    }

    // Query top ranked candidates from Elasticsearch
    const { jobs: rawJobs, total, isPersonalized } =
      await this.elasticsearchService.searchLandingPopularJobs({
        candidateSkills,
        size: 45,
      });

    // Apply Backend Company Diversity Algorithm
    const diverseJobs = applyCompanyDiversity(rawJobs, 2, 3);
    const totalDiverse = diverseJobs.length;
    const totalPages = Math.ceil(totalDiverse / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedJobs = diverseJobs.slice(startIndex, startIndex + limit);

    return {
      meta: {
        current: page,
        pageSize: limit,
        pages: totalPages,
        total: totalDiverse,
        isPersonalized,
      },
      result: paginatedJobs,
    };
  }

  async searchJobsFromElasticsearch(params: {
    query?: string;
    location?: string;
    skills?: string[];
    level?: string;
    minSalary?: number;
    maxSalary?: number;
    isHot?: boolean;
    isFeatured?: boolean;
    isUrgent?: boolean;
    companyId?: string;
    sort?: 'relevance' | 'newest' | 'salary_desc' | 'salary_asc';
    page?: number;
    limit?: number;
  }) {
    const { jobs, total, page, limit, totalPages } =
      await this.elasticsearchService.searchJobs(params);

    return {
      meta: {
        current: page,
        pageSize: limit,
        pages: totalPages,
        total,
      },
      result: jobs,
    };
  }

  async getRelatedJobs(id: string, limit = 6) {
    let list = await this.elasticsearchService.getRelatedJobs(id, limit);
    if (!list || list.length === 0) {
      const currentJob = await this.jobRepo.findOne({
        where: { _id: id, isDeleted: false },
        relations: ['company'],
      });
      if (currentJob) {
        if (currentJob.skills && currentJob.skills.length > 0) {
          const esRes = await this.elasticsearchService.searchJobs({
            skills: currentJob.skills,
            limit: limit + 1,
          });
          list = (esRes?.jobs || []).filter((j: any) => j._id !== id);
        }
        if (!list || list.length === 0) {
          const qb = this.activeJobQueryService
            .createActiveQuery()
            .leftJoinAndSelect('job.company', 'company')
            .where('job._id != :id', { id })
            .orderBy('job.createdAt', 'DESC')
            .take(limit);
          list = await qb.getMany();
        }
      }
    }
    return (list || []).slice(0, limit);
  }

  async getSearchSuggestions(query: string, limit = 8) {
    return await this.elasticsearchService.getSearchSuggestions(query, limit);
  }

  async countJobs() {
    return await this.activeJobQueryService.createActiveQuery().getCount();
  }
}

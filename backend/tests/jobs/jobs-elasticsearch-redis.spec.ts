import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminService } from 'src/admin/admin.service';
import { CompaniesService } from 'src/companies/companies.service';
import { Role } from 'src/decorator/customize';
import { ElasticsearchService } from 'src/elasticsearch/elasticsearch.service';
import { JobsController } from 'src/jobs/jobs.controller';
import { JobsService } from 'src/jobs/jobs.service';
import { RedisService } from 'src/redis/redis.service';
import { SavedJobsService } from 'src/saved-jobs/saved-jobs.service';

describe('Jobs, Redis, Elasticsearch & SavedJobs Module 2.5.1 fixes', () => {
  describe('RedisService prefix invalidation', () => {
    it('deletes only job cache keys via Redis SCAN without calling reset()', async () => {
      const scanMock = jest.fn(
        (
          cursor: string,
          _match: string,
          pattern: string,
          _count: string,
          _size: string,
          cb: (err: Error | null, res: [string, string[]]) => void,
        ) => {
          if (pattern === 'jobs:*' && cursor === '0') {
            cb(null, ['0', ['jobs:1:10', 'jobs:2:10']]);
          } else if (pattern === 'job:*' && cursor === '0') {
            cb(null, ['0', ['job:abc-123']]);
          } else {
            cb(null, ['0', []]);
          }
        },
      );
      const delClientMock = jest.fn((_keys: string[], cb: (err: Error | null) => void) =>
        cb(null),
      );
      const cacheManager: any = {
        reset: jest.fn(),
        del: jest.fn(),
        store: {
          getClient: () => ({
            scan: scanMock,
            del: delClientMock,
          }),
        },
      };

      const redisService = new RedisService(cacheManager);
      await redisService.invalidateJobsCache();

      expect(cacheManager.reset).not.toHaveBeenCalled();
      expect(scanMock).toHaveBeenCalledTimes(2);
      expect(delClientMock).toHaveBeenCalledWith(
        ['jobs:1:10', 'jobs:2:10'],
        expect.any(Function),
      );
      expect(delClientMock).toHaveBeenCalledWith(
        ['job:abc-123'],
        expect.any(Function),
      );
    });

    it('deletes only company keys on memory store without touching sessions', async () => {
      const cacheManager: any = {
        reset: jest.fn(),
        del: jest.fn().mockResolvedValue(undefined),
        store: {
          keys: jest
            .fn()
            .mockResolvedValue([
              'companies:1:10',
              'company:c1',
              'session:u1',
              'refresh_token:u1',
              'jobs:1:10',
            ]),
        },
      };

      const redisService = new RedisService(cacheManager);
      await redisService.invalidateCompaniesCache();

      expect(cacheManager.reset).not.toHaveBeenCalled();
      expect(cacheManager.del).toHaveBeenCalledTimes(2);
      expect(cacheManager.del).toHaveBeenCalledWith('companies:1:10');
      expect(cacheManager.del).toHaveBeenCalledWith('company:c1');
      expect(cacheManager.del).not.toHaveBeenCalledWith('session:u1');
    });
  });

  describe('JobsController verified JWT handling', () => {
    it('verifies JWT signature instead of decoding untrusted payloads', async () => {
      const jobsService: any = {
        getLandingPopularJobs: jest.fn().mockResolvedValue({ result: [] }),
        getApplicantCountStatus: jest.fn().mockResolvedValue({ isUnlocked: false }),
      };
      const jwtService: any = {
        decode: jest.fn(),
        verify: jest.fn().mockImplementation((token: string) => {
          if (token === 'forged-token') throw new Error('invalid signature');
          return { _id: 'user-1', role: Role.USER };
        }),
      };
      const configService = {
        get: jest.fn().mockReturnValue('test-secret'),
      } as unknown as ConfigService;

      const controller = new JobsController(
        jobsService,
        jwtService,
        configService,
      );

      await controller.getLandingPopular('1', '9', {
        headers: { authorization: 'Bearer forged-token' },
      });
      expect(jwtService.decode).not.toHaveBeenCalled();
      expect(jobsService.getLandingPopularJobs).toHaveBeenCalledWith(
        expect.objectContaining({ user: undefined }),
      );

      await controller.getApplicantCountStatus('job-1', {
        headers: { authorization: 'Bearer valid-token' },
      });
      expect(jwtService.verify).toHaveBeenCalledWith('valid-token', {
        secret: 'test-secret',
      });
      expect(jobsService.getApplicantCountStatus).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({ _id: 'user-1' }),
      );
    });
  });

  describe('JobsService quota, N+1 batching & cron expiry', () => {
    it('uses dynamic weeklyQuotaMax when unlocking applicant count', async () => {
      const jobRepo: any = {
        findOne: jest.fn().mockResolvedValue({ _id: 'job-1', company: { _id: 'c-1' } }),
      };
      const applicationRepo: any = {
        count: jest.fn().mockResolvedValue(42),
      };
      const jobApplicantViewRepo: any = {
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn((x) => x),
        save: jest.fn().mockResolvedValue({ _id: 'v-1' }),
      };
      const usersService: any = {
        findOne: jest.fn().mockResolvedValue({
          _id: 'cand-1',
          role: Role.USER,
          isPremium: true,
        }),
        isCandidatePremium: jest.fn().mockReturnValue(true),
        getUserCandidateWeeklyApplicantLimit: jest.fn().mockResolvedValue(15),
      };

      const service = new JobsService(
        jobRepo,
        { invalidateJobsCache: jest.fn() } as any,
        {} as any,
        applicationRepo,
        {} as any,
        {} as any,
        jobApplicantViewRepo,
        usersService,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const res = await service.unlockApplicantCount('job-1', {
        _id: 'cand-1',
        email: 'c@example.com',
        role: Role.USER,
      } as any);

      expect(res.weeklyQuotaMax).toBe(15);
      expect(res.weeklyQuotaUsed).toBe(1);
      expect(res.weeklyQuotaRemaining).toBe(14);
      expect(res.applicantCount).toBe(42);
    });

    it('batches HR application counts into one grouped query instead of N+1', async () => {
      const jobs = [
        {
          _id: 'j1',
          name: 'Job 1',
          isHot: true,
          boostExpiresAt: new Date(Date.now() - 60_000),
        },
        {
          _id: 'j2',
          name: 'Job 2',
          isHot: false,
          boostExpiresAt: null,
        },
      ];
      const hrJobsQb: any = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([jobs, 2]),
      };
      const appCountQb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ jobId: 'j1', count: '7' }]),
      };

      const jobRepo: any = {
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        findOne: jest.fn().mockResolvedValue(jobs[0]),
      };
      const applicationRepo: any = {
        createQueryBuilder: jest.fn().mockReturnValue(appCountQb),
        count: jest.fn(),
      };
      const service = new JobsService(
        jobRepo,
        { invalidateJobsCache: jest.fn() } as any,
        {
          findOne: jest.fn().mockResolvedValue({ _id: 'c1', isActive: true }),
        } as any,
        applicationRepo,
        {} as any,
        {} as any,
        {} as any,
        {
          findOneByEmail: jest
            .fn()
            .mockResolvedValue({ _id: 'hr1', company: { _id: 'c1' } }),
        } as any,
        {} as any,
        {} as any,
        { createNonDeletedQuery: jest.fn().mockReturnValue(hrJobsQb) } as any,
        {} as any,
        { indexJob: jest.fn() } as any,
      );

      const res = await service.getJobsByHr(
        { _id: 'hr1', email: 'hr@test.com' } as any,
        { current: '1', pageSize: '10' },
      );

      expect(applicationRepo.count).not.toHaveBeenCalled();
      expect(appCountQb.groupBy).toHaveBeenCalledWith('app.jobId');
      expect(res.result[0].applicationsCount).toBe(7);
      expect(res.result[1].applicationsCount).toBe(0);
      expect(res.result[0].isHot).toBe(false);
    });

    it('rejects endDate <= startDate when creating a job', async () => {
      const service = new JobsService(
        {} as any,
        {} as any,
        { findOne: jest.fn().mockResolvedValue({ _id: 'c1', isActive: true }) } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {
          findOneByEmail: jest
            .fn()
            .mockResolvedValue({ _id: 'hr1', company: { _id: 'c1' } }),
          isHrPremium: jest.fn().mockReturnValue(true),
          getUserMaxActiveJobs: jest.fn().mockReturnValue(999),
        } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await expect(
        service.create(
          {
            name: 'Test',
            company: { _id: 'c1' } as any,
            startDate: new Date('2026-12-10'),
            endDate: new Date('2026-12-01'),
          } as any,
          { _id: 'hr1', email: 'hr@test.com', role: Role.HR } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ElasticsearchService filter context, negotiable & accentless suggestions', () => {
    it('moves structured filters to bool.filter and handles negotiable salary', async () => {
      const searchMock = jest.fn().mockResolvedValue({
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: 'j-expired-hot',
              _score: 12,
              _source: {
                name: 'NodeJS Engineer',
                salary: 0,
                isHot: true,
                boostExpiresAt: new Date(Date.now() - 10_000).toISOString(),
              },
            },
          ],
        },
      });
      const esService = new ElasticsearchService({
        get: jest.fn().mockReturnValue('http://localhost:9200'),
      } as any);
      (esService as any).client = { search: searchMock };

      const res = await esService.searchJobs({
        query: 'NodeJS',
        negotiable: true,
        skills: ['NodeJS'],
        companyId: 'comp-1',
        sort: 'relevance',
      });

      const body = searchMock.mock.calls[0][0].body;
      const boolQuery = body.query.function_score.query.bool;
      expect(boolQuery.filter).toEqual(
        expect.arrayContaining([
          { term: { isActive: true } },
          { term: { isDeleted: false } },
          { bool: { must_not: { term: { 'company.isActive': false } } } },
          { terms: { skills: ['nodejs'] } },
          { term: { 'company._id': 'comp-1' } },
        ]),
      );
      expect(boolQuery.must).toHaveLength(1);
      expect(res.jobs[0].isHot).toBe(false);
    });

    it('matches Vietnamese suggestions across accentless queries', async () => {
      const searchMock = jest.fn().mockResolvedValue({
        hits: {
          hits: [
            {
              _source: {
                name: 'Lập trình viên Hà Nội',
                skills: ['TypeScript', 'Định vị PostGIS'],
              },
            },
          ],
        },
      });
      const esService = new ElasticsearchService({
        get: jest.fn().mockReturnValue('http://localhost:9200'),
      } as any);
      (esService as any).client = { search: searchMock };

      const suggestions = await esService.getSearchSuggestions('ha noi', 8);
      expect(suggestions).toContain('Lập trình viên Hà Nội');
    });

    it('matches Hà Nội district and OSM alias locations such as Long Biên or Hanoiï', async () => {
      const searchMock = jest.fn().mockResolvedValue({
        hits: { total: { value: 1 }, hits: [] },
      });
      const esService = new ElasticsearchService({
        get: jest.fn().mockReturnValue('http://localhost:9200'),
      } as any);
      (esService as any).client = { search: searchMock };

      await esService.searchJobs({
        query: 'NestJS',
        location: 'Hà Nội',
      });

      const body = searchMock.mock.calls[0][0].body;
      const filters = body.query.function_score.query.bool.filter;
      const locFilter = filters.find(
        (f: any) =>
          Array.isArray(f?.bool?.should) &&
          f.bool.should.some((s: any) => s?.match_phrase?.['location.text']),
      );
      const queries = locFilter.bool.should.map(
        (s: any) => s?.match_phrase?.['location.text']?.query,
      );
      expect(queries).toContain('Hà Nội');
      expect(queries).toContain('Hanoiï');
      expect(queries).toContain('Long Biên');
    });

    it('syncs job directly to Elasticsearch during JobsService.update', async () => {
      const updatedJob = {
        _id: 'job-sync-1',
        name: 'Senior Fullstack Engineer',
        location: 'Long Biên, Hà Nội',
        company: { _id: 'comp-1', name: 'TalentPulse', isActive: true },
        isDeleted: false,
      };
      const jobRepo: any = {
        findOne: jest.fn().mockResolvedValue(updatedJob),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const companyRepo: any = {
        findOne: jest.fn().mockResolvedValue({
          _id: 'comp-1',
          name: 'TalentPulse',
          isActive: true,
          isDeleted: false,
        }),
      };
      const esService: any = {
        indexJob: jest.fn().mockResolvedValue(undefined),
      };

      const service = new JobsService(
        jobRepo,
        { invalidateJobsCache: jest.fn() } as any,
        companyRepo,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {
          findOneByEmail: jest
            .fn()
            .mockResolvedValue({ _id: 'hr1', company: { _id: 'comp-1' } }),
        } as any,
        {} as any,
        {} as any,
        { findNonDeletedById: jest.fn().mockResolvedValue(updatedJob) } as any,
        { enqueue: jest.fn().mockResolvedValue(undefined) } as any,
        esService,
        { add: jest.fn() } as any,
      );

      await service.update(
        'job-sync-1',
        { location: 'Long Biên, Hà Nội', lat: 21.05, lon: 105.89 } as any,
        { _id: 'hr1', email: 'hr@test.com', role: Role.HR } as any,
      );

      expect(esService.indexJob).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'job-sync-1' }),
      );
    });
  });

  describe('SavedJobsService SQL pagination consistency', () => {
    it('filters active jobs and canonical active companies in SQL before counting', async () => {
      const qb: any = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [
            {
              createdAt: new Date('2026-11-20T00:00:00.000Z'),
              job: { _id: 'job-active', name: 'Active Backend', isActive: true },
            },
          ],
          1,
        ]),
      };

      const savedJobRepo: any = {
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      };
      const service = new SavedJobsService(savedJobRepo, {} as any);
      const res = await service.getMySavedJobs('user-1', 1, 10);

      expect(qb.andWhere).toHaveBeenCalledWith('job."isActive" = true');
      expect(qb.andWhere).toHaveBeenCalledWith(
        '"canonicalCompany"."isActive" = true',
      );
      expect(res.meta.total).toBe(1);
      expect(res.result).toHaveLength(1);
      expect(res.result[0].isSaved).toBe(true);
    });
  });

  describe('AdminService & CompaniesService ES + Redis sync', () => {
    it('syncs job to ES and invalidates cache on AdminService.toggleJobActive', async () => {
      const job = { _id: 'job-1', isActive: true };
      const jobRepo: any = {
        findOne: jest.fn().mockResolvedValue(job),
        save: jest.fn().mockResolvedValue({ ...job, isActive: false }),
      };
      const redisService: any = { invalidateJobsCache: jest.fn() };
      const jobIndexingService: any = { enqueue: jest.fn().mockResolvedValue(undefined) };
      const jobSyncQueue: any = { add: jest.fn().mockResolvedValue(undefined) };

      const adminService = new AdminService(
        {} as any,
        {} as any,
        jobRepo,
        {} as any,
        {} as any,
        redisService,
        {} as any,
        jobIndexingService,
        jobSyncQueue,
      );

      const updated = await adminService.toggleJobActive('job-1');
      expect(updated.isActive).toBe(false);
      expect(jobSyncQueue.add).toHaveBeenCalledWith(
        'sync-job',
        { jobId: 'job-1' },
        expect.any(Object),
      );
      expect(redisService.invalidateJobsCache).toHaveBeenCalledTimes(1);
    });

    it('removes company jobs from ES and invalidates job + company caches on CompaniesService.remove', async () => {
      const jobRepoQb: any = {
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ _id: 'job-1' }]),
      };
      const companyRepo: any = {
        findOne: jest.fn().mockResolvedValue({ _id: 'comp-1' }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const redisService: any = {
        invalidateCompaniesCache: jest.fn(),
        invalidateJobsCache: jest.fn(),
      };
      const jobIndexingService: any = { enqueue: jest.fn().mockResolvedValue(undefined) };
      const jobSyncQueue: any = { add: jest.fn().mockResolvedValue(undefined) };

      const companiesService = new CompaniesService(
        companyRepo,
        { createQueryBuilder: jest.fn().mockReturnValue(jobRepoQb) } as any,
        {} as any,
        {} as any,
        redisService,
        {} as any,
        { findOneByEmail: jest.fn().mockResolvedValue({ role: Role.ADMIN }) } as any,
        {} as any,
        jobIndexingService,
        {} as any,
        jobSyncQueue,
      );

      await companiesService.remove('comp-1', {
        _id: 'admin-1',
        email: 'admin@test.com',
        role: Role.ADMIN,
      } as any);

      expect(jobSyncQueue.add).toHaveBeenCalledWith(
        'delete-job',
        { jobId: 'job-1' },
        expect.any(Object),
      );
      expect(redisService.invalidateCompaniesCache).toHaveBeenCalledTimes(1);
      expect(redisService.invalidateJobsCache).toHaveBeenCalledTimes(1);
    });
  });

  it('rejects map search with ForbiddenException for free candidates', async () => {
    const service = new JobsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { isCandidatePremium: jest.fn().mockReturnValue(false) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.searchJobsByLocation(
        { lat: 21.02, lon: 105.85, radiusKm: 10 },
        { _id: 'u1', role: Role.USER } as any,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});

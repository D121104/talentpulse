import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { JobsService } from 'src/jobs/jobs.service';
import { Role } from 'src/decorator/customize';

describe('JobsService map search & coordinate sync', () => {
  function createQueryBuilderMock(entities: any[] = [], raw: any[] = []) {
    const qb: any = {
      andWhere: jest.fn(),
      addSelect: jest.fn(),
      orderBy: jest.fn(),
      offset: jest.fn(),
      limit: jest.fn(),
      getCount: jest.fn().mockResolvedValue(entities.length),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities, raw }),
    };
    qb.andWhere.mockReturnValue(qb);
    qb.addSelect.mockReturnValue(qb);
    qb.orderBy.mockReturnValue(qb);
    qb.offset.mockReturnValue(qb);
    qb.limit.mockReturnValue(qb);
    return qb;
  }

  function buildService(options?: {
    isCandidatePremium?: boolean;
    qb?: any;
    activeJob?: any;
    nonDeletedJob?: any;
    company?: any;
  }) {
    const qb = options?.qb ?? createQueryBuilderMock();
    const jobRepo: any = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const companyRepo: any = {
      findOne: jest.fn().mockResolvedValue(options?.company ?? null),
    };
    const activeJobQueryService: any = {
      createActiveQuery: jest.fn().mockReturnValue(qb),
      findActiveById: jest.fn().mockResolvedValue(options?.activeJob ?? null),
      findNonDeletedById: jest
        .fn()
        .mockResolvedValue(options?.nonDeletedJob ?? null),
    };
    const usersService: any = {
      isCandidatePremium: jest
        .fn()
        .mockReturnValue(options?.isCandidatePremium ?? true),
      findOneByEmail: jest.fn().mockResolvedValue({
        _id: 'hr-1',
        email: 'hr@example.com',
        company: { _id: 'comp-1', name: 'Test Co' },
      }),
    };
    const redisService: any = {
      invalidateJobsCache: jest.fn().mockResolvedValue(undefined),
    };
    const jobIndexingService: any = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };
    const cvProcessingService: any = {
      reprocessAllCVsForJob: jest.fn().mockResolvedValue(undefined),
    };
    const jobSyncQueue: any = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    const service = new JobsService(
      jobRepo,
      redisService,
      companyRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      usersService,
      {} as any,
      cvProcessingService,
      activeJobQueryService,
      jobIndexingService,
      {} as any,
      jobSyncQueue,
    );

    return {
      service,
      qb,
      jobRepo,
      activeJobQueryService,
      usersService,
    };
  }

  it('rejects non-premium candidates from map search', async () => {
    const { service } = buildService({ isCandidatePremium: false });

    await expect(
      service.searchJobsByLocation(
        { lat: 21.0285, lon: 105.8542, radiusKm: 10 },
        { _id: 'user-1', role: Role.USER } as any,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects out-of-range coordinates', async () => {
    const { service } = buildService({ isCandidatePremium: true });

    await expect(
      service.searchJobsByLocation({ lat: 120, lon: 105.8542, radiusKm: 10 }, {
        _id: 'user-1',
        role: Role.USER,
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('queries through ActiveJobQueryService and clamps radiusKm', async () => {
    const qb = createQueryBuilderMock(
      [{ _id: 'job-1', name: 'Backend Engineer', lat: 21.02, lon: 105.8 }],
      [{ distance_km: '2.34', effective_lat: '21.02', effective_lon: '105.8' }],
    );
    const { service, activeJobQueryService } = buildService({
      isCandidatePremium: true,
      qb,
    });

    const response = await service.searchJobsByLocation(
      {
        lat: 21.0285,
        lon: 105.8542,
        radiusKm: 500,
        query: 'Backend',
        page: 1,
        limit: 20,
      },
      { _id: 'user-1', role: Role.USER } as any,
    );

    expect(activeJobQueryService.createActiveQuery).toHaveBeenCalledTimes(1);
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('ST_DWithin'),
      expect.objectContaining({
        lat: 21.0285,
        lon: 105.8542,
        radiusMeters: 200000,
      }),
    );
    expect(qb.getCount).toHaveBeenCalledTimes(1);
    expect(response.meta.total).toBe(1);
    expect(response.result[0]).toMatchObject({
      _id: 'job-1',
      lat: 21.02,
      lon: 105.8,
      distanceKm: 2.3,
    });
  });

  it('syncs locationPoint when JobsService.update receives coordinates', async () => {
    const { service, jobRepo } = buildService({
      nonDeletedJob: { _id: 'job-1', description: 'Old', lat: null, lon: null },
    });

    await service.update(
      'job-1',
      { lat: 21.0173, lon: 105.7838 } as any,
      { _id: 'hr-1', email: 'hr@example.com', role: Role.HR } as any,
    );

    expect(jobRepo.update).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        lat: 21.0173,
        lon: 105.7838,
        locationPoint: {
          type: 'Point',
          coordinates: [105.7838, 21.0173],
        },
      }),
    );
  });

  it('keeps public findOne strict to active jobs without non-active fallback', async () => {
    const { service, activeJobQueryService } = buildService({
      activeJob: null,
      nonDeletedJob: { _id: 'job-expired', isActive: true },
    });

    await expect(service.findOne('job-expired')).rejects.toThrow(
      'Job not found',
    );
    expect(activeJobQueryService.findNonDeletedById).not.toHaveBeenCalled();
  });
});

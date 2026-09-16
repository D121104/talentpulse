import { JobIndexingService } from './job-indexing.service';

function service(jobRepo: any) {
  return new JobIndexingService(
    {} as any,
    {} as any,
    jobRepo,
    {} as any,
    {} as any,
  );
}

describe('JobIndexingService backfill', () => {
  it('enqueues a bounded canonical job batch and drains the same bound', async () => {
    const jobs = [{ _id: 'job-1' }, { _id: 'job-2' }];
    const indexing = service({ find: jest.fn().mockResolvedValue(jobs) });
    const enqueue = jest.spyOn(indexing, 'enqueue').mockResolvedValue();
    const drain = jest.spyOn(indexing, 'drain').mockResolvedValue({
      claimed: 2,
      completed: 2,
      failed: 0,
      leaseLost: 0,
    });
    await expect(indexing.backfill(2)).resolves.toEqual({
      claimed: 2,
      completed: 2,
      failed: 0,
      leaseLost: 0,
    });
    expect(enqueue).toHaveBeenCalledWith('job-1');
    expect(enqueue).toHaveBeenCalledWith('job-2');
    expect(drain).toHaveBeenCalledWith(2);
    expect((indexing as any).jobRepo.find).toHaveBeenCalledWith({
      where: { isDeleted: false },
      take: 2,
    });
  });

  it('forces completed events through explicit reconciliation', async () => {
    const jobs = [{ _id: 'job-1' }];
    const indexing = service({ find: jest.fn().mockResolvedValue(jobs) });
    const enqueue = jest.spyOn(indexing, 'enqueue').mockResolvedValue();
    jest.spyOn(indexing, 'drain').mockResolvedValue({
      claimed: 0,
      completed: 0,
      failed: 0,
      leaseLost: 0,
    });

    await indexing.backfill(1, true);

    expect(enqueue).toHaveBeenCalledWith('job-1', true);
  });

  it('rejects an unbounded or invalid operation limit', async () => {
    const indexing = service({ find: jest.fn() });
    await expect(indexing.backfill(0)).rejects.toThrow('maxOperations');
    await expect(indexing.backfill(10001)).rejects.toThrow('maxOperations');
  });
});

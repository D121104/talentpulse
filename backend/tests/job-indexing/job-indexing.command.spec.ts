import { JobIndexingService } from 'src/job-indexing/job-indexing.service';
import { JobIndexingProcessor } from 'src/job-indexing/job-indexing.processor';

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
    expect(enqueue).toHaveBeenCalledWith('job-1', false, expect.any(Date));
    expect(enqueue).toHaveBeenCalledWith('job-2', false, expect.any(Date));
    expect(drain).toHaveBeenCalledWith(2);
    expect((indexing as any).jobRepo.find).toHaveBeenCalledWith({
      where: { isDeleted: false },
      take: 2,
    });
  });

  it('reconciles in bounded pages without force-requeueing completed events', async () => {
    const jobs = [{ _id: 'job-1' }];
    const find = jest
      .fn()
      .mockResolvedValueOnce(jobs)
      .mockResolvedValueOnce([]);
    const indexing = service({ find });
    const enqueue = jest.spyOn(indexing, 'enqueue').mockResolvedValue();
    jest.spyOn(indexing, 'drain').mockResolvedValue({
      claimed: 0,
      completed: 0,
      failed: 0,
      leaseLost: 0,
    });

    await indexing.backfill(1, true);

    expect(enqueue).toHaveBeenCalledWith('job-1', false, expect.any(Date));
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ withDeleted: true, take: 1, skip: 0 }),
    );
  });

  it('runs reconciliation from the scheduled processor path', async () => {
    const reconcile = jest.fn().mockResolvedValue({
      claimed: 1,
      completed: 1,
      failed: 0,
      leaseLost: 0,
    });
    await new JobIndexingProcessor({ reconcile } as any).processPendingOutbox();
    expect(reconcile).toHaveBeenCalledWith(25);
  });

  it('rejects an unbounded or invalid operation limit', async () => {
    const indexing = service({ find: jest.fn() });
    await expect(indexing.backfill(0)).rejects.toThrow('maxOperations');
    await expect(indexing.backfill(10001)).rejects.toThrow('maxOperations');
  });
});

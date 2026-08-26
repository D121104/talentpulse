import {
  ActiveJobState,
  CanonicalCompanyState,
  isCanonicalActiveJob,
} from './active-job-query.service';

describe('isCanonicalActiveJob', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');
  const company: CanonicalCompanyState = {
    _id: 'company-1',
    isActive: true,
    isDeleted: false,
    deletedAt: null,
  };
  const validJob: ActiveJobState = {
    isActive: true,
    isDeleted: false,
    deletedAt: null,
    startDate: now,
    endDate: new Date('2026-01-01T12:00:01.000Z'),
    company: { _id: company._id },
  };

  it('includes the start boundary and excludes the end boundary', () => {
    expect(isCanonicalActiveJob(validJob, company, now)).toBe(true);
    expect(
      isCanonicalActiveJob(
        { ...validJob, startDate: new Date('2026-01-01T12:00:01.000Z') },
        company,
        now,
      ),
    ).toBe(false);
    expect(
      isCanonicalActiveJob(
        { ...validJob, endDate: now },
        company,
        now,
      ),
    ).toBe(false);
  });

  it.each([
    ['missing start date', { startDate: null }],
    ['missing end date', { endDate: null }],
  ])('%s is not active', (_label, dates) => {
    expect(
      isCanonicalActiveJob({ ...validJob, ...dates }, company, now),
    ).toBe(false);
  });

  it.each([
    ['inactive job', { isActive: false }],
    ['deleted job flag', { isDeleted: true }],
    ['soft-deleted job', { deletedAt: new Date('2025-12-31T00:00:00.000Z') }],
    ['missing company', { company: null }],
    ['mismatched company snapshot', { company: { _id: 'company-2' } }],
  ])('%s is not active', (_label, job) => {
    expect(isCanonicalActiveJob({ ...validJob, ...job }, company, now)).toBe(
      false,
    );
  });

  it.each([
    ['inactive company', { isActive: false }],
    ['deleted company flag', { isDeleted: true }],
    ['soft-deleted company', { deletedAt: new Date('2025-12-31T00:00:00.000Z') }],
  ])('%s is not active', (_label, companyState) => {
    expect(
      isCanonicalActiveJob(validJob, { ...company, ...companyState }, now),
    ).toBe(false);
  });
});

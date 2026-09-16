import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Company } from 'src/companies/entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';
import {
  buildCanonicalJobSnapshot,
  buildCanonicalProjection,
  buildJobRepresentationFromSnapshot,
  computeJobContentHash,
  computeJobContentHashFromSnapshot,
  buildCanonicalJobSourceVersionProjection,
  getJobSourceVersion,
  serializeCanonicalJobSourceVersion,
  deterministicJobPointId,
} from './job-indexing.normalization';
import { JOB_INDEX_VERSION } from './job-indexing.constants';
import { createHash } from 'crypto';

function fixture() {
  const company = Object.assign(new Company(), {
    _id: '00000000-0000-4000-8000-000000000001',
    name: 'Acme',
    description: 'Build tools',
    address: 'Hanoi',
    isActive: true,
    isDeleted: false,
    deletedAt: null,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });
  const job = Object.assign(new Job(), {
    _id: '00000000-0000-4000-8000-000000000002',
    name: 'Backend Engineer',
    description: 'Build APIs',
    skills: ['TypeScript', 'PostgreSQL'],
    level: 'senior',
    location: 'Hanoi',
    company: { _id: company._id, name: company.name },
    isActive: true,
    isDeleted: false,
    deletedAt: null,
    startDate: new Date('2025-01-01T00:00:00Z'),
    endDate: new Date('2027-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });
  return { job, company };
}

describe('job indexing normalization', () => {
  it('builds an active canonical projection and stable representation hash', () => {
    const { job, company } = fixture();
    const projection = buildCanonicalProjection(
      job,
      company,
      new Date('2026-06-01T00:00:00Z'),
    );
    expect(projection.active).toBe(true);
    expect(projection.contentHash).toBe(computeJobContentHash(job, company));
    expect(projection.contentHash).toHaveLength(64);
  });

  it('matches the FastAPI job document/hash contract for the canonical snapshot', () => {
    const { job, company } = fixture();
    const snapshot = buildCanonicalJobSnapshot(job, company);
    const document = buildJobRepresentationFromSnapshot(snapshot);
    const expectedDocument = [
      'title: Backend Engineer',
      'description: Build APIs',
      'skills: PostgreSQL, TypeScript',
      'company: Acme',
      'location: Hanoi',
      'level: senior',
    ].join('\n');
    expect(document).toBe(expectedDocument);
    expect(computeJobContentHash(job, company)).toBe(
      createHash('sha256').update(expectedDocument, 'utf8').digest('hex'),
    );
  });

  it('converts PostgreSQL numeric salary strings to strict contract numbers', () => {
    const { job, company } = fixture();
    job.salary = '38000000' as unknown as number;

    expect(buildCanonicalJobSnapshot(job, company).salary).toBe(38000000);
  });

  it('uses an explicit timestamp-only canonical source-version projection', () => {
    const { job, company } = fixture();
    const sourceProjection = buildCanonicalJobSourceVersionProjection(
      job,
      company,
    );

    expect(sourceProjection).toEqual({
      job_updated_at: '2026-01-01T00:00:00.000Z',
      company_updated_at: '2026-01-01T00:00:00.000Z',
    });
    expect(serializeCanonicalJobSourceVersion(sourceProjection)).toBe(
      '2026-01-01T00:00:00.000Z|2026-01-01T00:00:00.000Z',
    );
    expect(getJobSourceVersion(job, company)).toBe(
      createHash('sha256')
        .update('2026-01-01T00:00:00.000Z|2026-01-01T00:00:00.000Z', 'utf8')
        .digest('hex'),
    );

    // Non-timestamp fields are intentionally outside the source-state
    // projection; persistence's UpdateDateColumn supplies the fencing change.
    const baseline = fixture();
    const baselineContentHash = computeJobContentHash(
      baseline.job,
      baseline.company,
    );
    job.description = 'Build a different description';
    company.name = 'A different company name';
    expect(getJobSourceVersion(job, company)).toBe(
      getJobSourceVersion(baseline.job, baseline.company),
    );
    expect(computeJobContentHash(job, company)).not.toBe(baselineContentHash);
    expect(getJobSourceVersion(job, company)).not.toBe(
      computeJobContentHash(job, company),
    );

    const contentHashBeforeTimestampMutation = computeJobContentHash(
      job,
      company,
    );
    job.updatedAt = new Date('2026-01-02T00:00:00Z');
    expect(getJobSourceVersion(job, company)).not.toBe(
      getJobSourceVersion(baseline.job, baseline.company),
    );
    expect(computeJobContentHash(job, company)).toBe(
      contentHashBeforeTimestampMutation,
    );

    company.updatedAt = new Date('2026-01-02T00:00:00Z');
    expect(getJobSourceVersion(job, company)).not.toBe(
      getJobSourceVersion(baseline.job, baseline.company),
    );
  });

  it('excludes inactive jobs from the canonical projection', () => {
    const { job, company } = fixture();
    job.isActive = false;
    expect(buildCanonicalProjection(job, company).active).toBe(false);
  });

  it('uses a deterministic versioned point id', () => {
    const id = deterministicJobPointId('job-1');
    expect(id).toBe(deterministicJobPointId('job-1'));
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JOB_INDEX_VERSION).toBe('demo-v1');
  });
});

type NormalizationFixture = {
  fixture_version: string;
  normalization_version: string;
  cases: Array<{
    id: string;
    snapshot: import('./job-indexing.types').CanonicalJobSnapshot;
    expected: { document: string; content_hash: string };
  }>;
};

function loadNormalizationFixture(): NormalizationFixture {
  return JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '../../../contracts/job-indexing-normalization-v1.json',
      ),
      'utf8',
    ),
  ) as NormalizationFixture;
}

describe('job indexing normalization golden fixture', () => {
  it('matches the checked-in document and SHA-256 values', () => {
    const fixture = loadNormalizationFixture();

    expect(fixture.fixture_version).toBe('job-indexing-normalization-v1');
    expect(fixture.normalization_version).toBe('job-normalization-v1');
    expect(fixture.cases).toHaveLength(2);

    for (const testCase of fixture.cases) {
      expect(buildJobRepresentationFromSnapshot(testCase.snapshot)).toBe(
        testCase.expected.document,
      );
      expect(computeJobContentHashFromSnapshot(testCase.snapshot)).toBe(
        testCase.expected.content_hash,
      );
    }
  });
});

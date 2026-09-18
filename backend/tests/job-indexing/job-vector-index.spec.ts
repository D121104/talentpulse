import {
  DeterministicJobEmbeddingProvider,
  InMemoryJobVectorIndex,
} from 'src/job-indexing/job-vector-index';
import { deterministicJobPointId } from 'src/job-indexing/job-indexing.normalization';

describe('job vector test doubles', () => {
  it('creates deterministic vectors with the configured dimension', async () => {
    const provider = new DeterministicJobEmbeddingProvider(1024);
    const first = await provider.embed('same job');
    const second = await provider.embed('same job');
    expect(first).toEqual(second);
    expect(first).toHaveLength(1024);
  });

  it('replaces and deletes points by stable job identity', async () => {
    const index = new InMemoryJobVectorIndex();
    const point = {
      id: deterministicJobPointId('job-1'),
      vector: [1],
      payload: {
        job_id: 'job-1',
        company_id: 'company-1',
        status: 'ACTIVE' as const,
        is_active: true as const,
        is_deleted: false as const,
        company_is_active: true as const,
        location: null,
        level: null,
        salary: null,
        content_hash: 'hash',
        representation_version: 'demo-v1',
        index_version: 'demo-v1',
        source_version: 'source',
      },
    };
    await index.upsert(point);
    expect(await index.get('job-1')).toEqual(point);
    await index.delete('job-1');
    expect(await index.get('job-1')).toBeNull();
  });
});

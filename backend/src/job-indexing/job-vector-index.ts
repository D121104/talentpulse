import { createHash } from 'crypto';
import { JOB_EMBEDDING_DIMENSIONS } from './job-indexing.constants';
import { JobVectorPayload, JobVectorPoint } from './job-indexing.types';
import { deterministicJobPointId } from './job-indexing.normalization';

export interface JobEmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export interface JobVectorIndex {
  initialize(): Promise<void>;
  get(jobId: string): Promise<JobVectorPoint | null>;
  upsert(point: JobVectorPoint): Promise<void>;
  delete(jobId: string): Promise<void>;
}

export class DeterministicJobEmbeddingProvider implements JobEmbeddingProvider {
  constructor(private readonly dimensions = JOB_EMBEDDING_DIMENSIONS) {}

  async embed(text: string): Promise<number[]> {
    const output: number[] = [];
    let seed = createHash('sha256').update(text).digest();
    for (let index = 0; index < this.dimensions; index += 1) {
      if (index % seed.length === 0)
        seed = createHash('sha256').update(seed).digest();
      output.push(seed[index % seed.length] / 127.5 - 1);
    }
    const norm =
      Math.sqrt(output.reduce((sum, value) => sum + value * value, 0)) || 1;
    return output.map((value) => value / norm);
  }
}

export class InMemoryJobVectorIndex implements JobVectorIndex {
  readonly points = new Map<string, JobVectorPoint>();

  async initialize(): Promise<void> {
    return;
  }

  async get(jobId: string): Promise<JobVectorPoint | null> {
    return this.points.get(deterministicJobPointId(jobId)) ?? null;
  }

  async upsert(point: JobVectorPoint): Promise<void> {
    this.points.set(point.id, point);
  }

  async delete(jobId: string): Promise<void> {
    this.points.delete(deterministicJobPointId(jobId));
  }
}

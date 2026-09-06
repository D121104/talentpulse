import axios, { AxiosInstance } from 'axios';
import { createHash } from 'crypto';
import {
  JOB_EMBEDDING_DIMENSIONS,
  JOB_INDEX_ALIAS,
  JOB_INDEX_COLLECTION,
  JOB_INDEX_VERSION,
} from './job-indexing.constants';
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

  async initialize(): Promise<void> {}

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

export class FailClosedJobEmbeddingProvider implements JobEmbeddingProvider {
  async embed(): Promise<number[]> {
    throw new Error('Production Cohere embedding adapter is not configured');
  }
}

export class FailClosedJobVectorIndex implements JobVectorIndex {
  async initialize(): Promise<void> {
    throw new Error('Production Qdrant adapter is not configured');
  }
  async get(): Promise<JobVectorPoint | null> {
    throw new Error('Production Qdrant adapter is not configured');
  }
  async upsert(): Promise<void> {
    throw new Error('Production Qdrant adapter is not configured');
  }
  async delete(): Promise<void> {
    throw new Error('Production Qdrant adapter is not configured');
  }
}

export class CohereJobEmbeddingProvider implements JobEmbeddingProvider {
  private readonly http: AxiosInstance;
  constructor(
    apiKey: string,
    private readonly model = 'embed-multilingual-v3.0',
  ) {
    this.http = axios.create({
      baseURL: 'https://api.cohere.com',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.http.post('/v1/embed', {
      model: this.model,
      input_type: 'search_document',
      texts: [text],
      embedding_types: ['float'],
    });
    const embeddings =
      response.data?.embeddings?.float ?? response.data?.embeddings;
    const vector = Array.isArray(embeddings?.[0]) ? embeddings[0] : null;
    if (!vector || vector.length !== JOB_EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Cohere returned an invalid ${JOB_EMBEDDING_DIMENSIONS}-dimension vector`,
      );
    }
    return vector;
  }
}

export class QdrantJobVectorIndex implements JobVectorIndex {
  private readonly http: AxiosInstance;
  constructor(baseUrl: string, apiKey?: string) {
    this.http = axios.create({
      baseURL: baseUrl.replace(/\/$/, ''),
      headers: apiKey ? { 'api-key': apiKey } : undefined,
      timeout: 30000,
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.http.put(`/collections/${JOB_INDEX_COLLECTION}`, {
        vectors: { size: JOB_EMBEDDING_DIMENSIONS, distance: 'Cosine' },
      });
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 409)
        throw error;
    }
    for (const field of [
      'job_id',
      'company_id',
      'status',
      'is_active',
      'is_deleted',
      'company_is_active',
      'location',
      'level',
      'representation_version',
      'index_version',
    ]) {
      try {
        await this.http.put(`/collections/${JOB_INDEX_COLLECTION}/index`, {
          field_name: field,
          field_schema: [
            'is_active',
            'is_deleted',
            'company_is_active',
          ].includes(field)
            ? 'bool'
            : 'keyword',
        });
      } catch (error) {
        if (!axios.isAxiosError(error) || error.response?.status !== 409)
          throw error;
      }
    }
    try {
      await this.http.post('/collections/aliases', {
        actions: [
          {
            create_alias: {
              collection_name: JOB_INDEX_COLLECTION,
              alias_name: JOB_INDEX_ALIAS,
            },
          },
        ],
      });
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 409)
        throw error;
    }
  }

  async get(jobId: string): Promise<JobVectorPoint | null> {
    try {
      const response = await this.http.get(
        `/collections/${JOB_INDEX_COLLECTION}/points/${deterministicJobPointId(
          jobId,
        )}`,
        {
          params: { with_vector: true },
        },
      );
      const point = response.data?.result;
      if (!point) return null;
      return {
        id: String(point.id),
        vector: point.vector,
        payload: point.payload as JobVectorPayload,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404)
        return null;
      throw error;
    }
  }

  async upsert(point: JobVectorPoint): Promise<void> {
    await this.http.put(
      `/collections/${JOB_INDEX_COLLECTION}/points?wait=true`,
      {
        points: [
          { id: point.id, vector: point.vector, payload: point.payload },
        ],
      },
    );
  }

  async delete(jobId: string): Promise<void> {
    await this.http.post(
      `/collections/${JOB_INDEX_COLLECTION}/points/delete?wait=true`,
      {
        points: [deterministicJobPointId(jobId)],
      },
    );
  }
}

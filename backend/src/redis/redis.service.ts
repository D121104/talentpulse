import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class RedisService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async getValue<T>(key: string): Promise<T | null> {
    const value = await this.cacheManager.get<T>(key);
    return value || null;
  }

  async setValue(key: string, value: any, ttl?: number): Promise<void> {
    if (ttl) {
      await this.cacheManager.set(key, value, ttl);
    } else {
      await this.cacheManager.set(key, value);
    }
  }

  async deleteValue(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  async clearCache(): Promise<void> {
    await this.cacheManager.reset();
  }

  // Cache job list
  async cacheJobs(page: number, limit: number, jobs: any): Promise<void> {
    const key = `jobs:${page}:${limit}`;
    await this.setValue(key, jobs, 60 * 5); // 5 minutes
  }

  async getCachedJobs(page: number, limit: number): Promise<any> {
    const key = `jobs:${page}:${limit}`;
    return this.getValue(key);
  }

  // Cache company list
  async cacheCompanies(
    page: number,
    limit: number,
    companies: any,
  ): Promise<void> {
    const key = `companies:${page}:${limit}`;
    await this.setValue(key, companies, 60 * 5); // 5 minutes
  }

  async getCachedCompanies(page: number, limit: number): Promise<any> {
    const key = `companies:${page}:${limit}`;
    return this.getValue(key);
  }

  // Cache single job
  async cacheJob(jobId: string, job: any): Promise<void> {
    const key = `job:${jobId}`;
    await this.setValue(key, job, 60 * 10); // 10 minutes
  }

  async getCachedJob(jobId: string): Promise<any> {
    const key = `job:${jobId}`;
    return this.getValue(key);
  }

  // Cache single company
  async cacheCompany(companyId: string, company: any): Promise<void> {
    const key = `company:${companyId}`;
    await this.setValue(key, company, 60 * 10); // 10 minutes
  }

  async getCachedCompany(companyId: string): Promise<any> {
    const key = `company:${companyId}`;
    return this.getValue(key);
  }

  // Invalidate cache
  async invalidateJobsCache(): Promise<void> {
    // Note: This is a simplified version. In production, you might want to use Redis KEYS command
    // or maintain a list of cached keys
    await this.clearCache();
  }

  async invalidateCompaniesCache(): Promise<void> {
    await this.clearCache();
  }

  // User session management
  async setUserSession(
    userId: string,
    sessionData: any,
    ttl: number = 60 * 60 * 24,
  ): Promise<void> {
    const key = `session:${userId}`;
    await this.setValue(key, sessionData, ttl);
  }

  async getUserSession(userId: string): Promise<any> {
    const key = `session:${userId}`;
    return this.getValue(key);
  }

  async removeUserSession(userId: string): Promise<void> {
    const key = `session:${userId}`;
    await this.deleteValue(key);
  }

  // Refresh token management
  async setRefreshToken(
    userId: string,
    token: string,
    ttl: number = 60 * 60 * 24 * 7,
  ): Promise<void> {
    const key = `refresh_token:${userId}`;
    await this.setValue(key, token, ttl);
  }

  async getRefreshToken(userId: string): Promise<string | null> {
    const key = `refresh_token:${userId}`;
    return this.getValue(key);
  }

  async removeRefreshToken(userId: string): Promise<void> {
    const key = `refresh_token:${userId}`;
    await this.deleteValue(key);
  }
}

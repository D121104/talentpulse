import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import { Job } from 'src/jobs/entities/job.entity';

export const TALENTPULSE_JOBS_INDEX = 'talentpulse_jobs';

export interface ElasticsearchJobDoc {
  _id: string;
  name: string;
  description: string;
  skills: string[];
  company: {
    _id: string;
    name: string;
    logo?: string;
    isActive?: boolean;
  };
  salary: number;
  level: string;
  location: string;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  isHot: boolean;
  boostedAt: string | null;
  boostExpiresAt: string | null;
  isFeatured: boolean;
  isUrgent: boolean;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchService.name);
  private client: Client;

  constructor(private readonly configService: ConfigService) {
    const node =
      this.configService.get<string>('ELASTICSEARCH_NODE') ||
      'http://localhost:9200';
    this.client = new Client({
      node,
    });
  }

  async onModuleInit() {
    try {
      await this.ensureIndexExists();
    } catch (err) {
      this.logger.warn(
        `Could not initialize Elasticsearch index on startup: ${err.message}`,
      );
    }
  }

  getClient(): Client {
    return this.client;
  }

  /**
   * Khởi tạo Index với Mapping & Multi-field Analyzers chuẩn
   */
  async ensureIndexExists(): Promise<void> {
    try {
      const exists = await this.client.indices.exists({
        index: TALENTPULSE_JOBS_INDEX,
      });

      if (!exists) {
        this.logger.log(`Creating Elasticsearch index "${TALENTPULSE_JOBS_INDEX}"...`);
        await this.client.indices.create({
          index: TALENTPULSE_JOBS_INDEX,
          settings: {
            analysis: {
              analyzer: {
                vi_text_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'asciifolding'],
                },
                autocomplete_analyzer: {
                  type: 'custom',
                  tokenizer: 'autocomplete_tokenizer',
                  filter: ['lowercase', 'asciifolding'],
                },
              },
              tokenizer: {
                autocomplete_tokenizer: {
                  type: 'edge_ngram',
                  min_gram: 2,
                  max_gram: 15,
                  token_chars: ['letter', 'digit'],
                },
              },
            },
          },
          mappings: {
            properties: {
              name: {
                type: 'text',
                analyzer: 'vi_text_analyzer',
                fields: {
                  raw: { type: 'keyword' },
                  autocomplete: {
                    type: 'text',
                    analyzer: 'autocomplete_analyzer',
                    search_analyzer: 'vi_text_analyzer',
                  },
                },
              },
              description: { type: 'text', analyzer: 'vi_text_analyzer' },
              skills: {
                type: 'keyword',
                fields: {
                  text: { type: 'text', analyzer: 'vi_text_analyzer' },
                },
              },
              company: {
                properties: {
                  _id: { type: 'keyword' },
                  name: {
                    type: 'text',
                    analyzer: 'vi_text_analyzer',
                    fields: { raw: { type: 'keyword' } },
                  },
                  logo: { type: 'keyword', index: false },
                  isActive: { type: 'boolean' },
                },
              },
              salary: { type: 'long' },
              location: {
                type: 'keyword',
                fields: { text: { type: 'text', analyzer: 'vi_text_analyzer' } },
              },
              level: { type: 'keyword' },
              isHot: { type: 'boolean' },
              boostedAt: { type: 'date' },
              boostExpiresAt: { type: 'date' },
              isFeatured: { type: 'boolean' },
              isUrgent: { type: 'boolean' },
              isActive: { type: 'boolean' },
              isDeleted: { type: 'boolean' },
              startDate: { type: 'date' },
              endDate: { type: 'date' },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' },
            },
          },
        });
        this.logger.log(`Elasticsearch index "${TALENTPULSE_JOBS_INDEX}" created successfully`);
      }
    } catch (error) {
      this.logger.error(`Failed to ensure Elasticsearch index: ${error.message}`);
      throw error;
    }
  }

  /**
   * Chuyển đổi Job entity sang document chuẩn của Elasticsearch (không chứa _id trong source body)
   */
  transformJobToDoc(job: Job): Omit<ElasticsearchJobDoc, '_id'> {
    const rawSkills = Array.isArray(job.skills) ? job.skills : [];
    // Normalize skills to lowercase for precise terms match
    const normalizedSkills = rawSkills
      .map((s) => (typeof s === 'string' ? s.trim().toLowerCase() : ''))
      .filter(Boolean);

    return {
      name: job.name || '',
      description: job.description || '',
      skills: normalizedSkills,
      company: {
        _id: job.company?._id || '',
        name: job.company?.name || '',
        logo: job.company?.logo || '',
        isActive: job.company?.isActive !== false,
      },
      salary: Number(job.salary) || 0,
      level: job.level || '',
      location: job.location || '',
      startDate: job.startDate ? new Date(job.startDate).toISOString() : null,
      endDate: job.endDate ? new Date(job.endDate).toISOString() : null,
      isActive: job.isActive !== false,
      isHot: Boolean(job.isHot),
      boostedAt: job.boostedAt ? new Date(job.boostedAt).toISOString() : null,
      boostExpiresAt: job.boostExpiresAt
        ? new Date(job.boostExpiresAt).toISOString()
        : null,
      isFeatured: Boolean(job.isFeatured),
      isUrgent: Boolean(job.isUrgent),
      isDeleted: Boolean(job.isDeleted),
      deletedAt: job.deletedAt ? new Date(job.deletedAt).toISOString() : null,
      createdAt: job.createdAt
        ? new Date(job.createdAt).toISOString()
        : new Date().toISOString(),
      updatedAt: job.updatedAt
        ? new Date(job.updatedAt).toISOString()
        : new Date().toISOString(),
    };
  }

  /**
   * Index (Thêm/Sửa) một Job vào Elasticsearch với Document ID = job._id (Idempotent)
   */
  async indexJob(job: Job): Promise<void> {
    if (!job || !job._id) return;
    const doc = this.transformJobToDoc(job);
    await this.client.index({
      index: TALENTPULSE_JOBS_INDEX,
      id: job._id,
      document: doc,
      refresh: 'wait_for',
    });
  }

  /**
   * Xóa Job khỏi Elasticsearch
   */
  async deleteJob(jobId: string): Promise<void> {
    if (!jobId) return;
    try {
      await this.client.delete({
        index: TALENTPULSE_JOBS_INDEX,
        id: jobId,
        refresh: 'wait_for',
      });
    } catch (err) {
      if (err.meta?.statusCode !== 404) {
        this.logger.warn(`Failed to delete job ${jobId} from ES: ${err.message}`);
      }
    }
  }

  /**
   * Bulk index một danh sách jobs (Dùng cho script đồng bộ dữ liệu)
   */
  async bulkIndexJobs(jobs: Job[]): Promise<{ count: number; errors: any[] }> {
    if (!jobs || jobs.length === 0) return { count: 0, errors: [] };

    await this.ensureIndexExists();

    const operations = jobs.flatMap((job) => [
      { index: { _index: TALENTPULSE_JOBS_INDEX, _id: job._id } },
      this.transformJobToDoc(job),
    ]);

    const bulkResponse = await this.client.bulk({
      refresh: true,
      operations,
    });

    if (bulkResponse.errors) {
      const erroredDocuments = bulkResponse.items.filter((item: any) => {
        const operation = Object.keys(item)[0];
        return item[operation].error;
      });
      this.logger.error(`Bulk index had ${erroredDocuments.length} errors`);
      return {
        count: jobs.length - erroredDocuments.length,
        errors: erroredDocuments,
      };
    }

    return { count: jobs.length, errors: [] };
  }

  /**
   * Truy vấn danh sách việc làm phổ biến/tốt nhất cho Landing Page
   * Áp dụng Additive Scoring & Hot Boost có kiểm soát
   */
  async searchLandingPopularJobs(options: {
    candidateSkills?: string[];
    size?: number;
  }): Promise<{ jobs: any[]; total: number; isPersonalized: boolean }> {
    const { candidateSkills = [], size = 45 } = options;
    const nowIso = new Date().toISOString();

    const normalizedCandidateSkills = candidateSkills
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const isPersonalized = normalizedCandidateSkills.length > 0;

    // Active filters
    const filterConditions: any[] = [
      { term: { isActive: true } },
      { term: { isDeleted: false } },
    ];

    // Must be valid in date bounds if dates exist
    const mustConditions: any[] = [
      {
        bool: {
          should: [
            { bool: { must_not: { exists: { field: 'startDate' } } } },
            { range: { startDate: { lte: nowIso } } },
          ],
        },
      },
      {
        bool: {
          should: [
            { bool: { must_not: { exists: { field: 'endDate' } } } },
            { range: { endDate: { gt: nowIso } } },
          ],
        },
      },
    ];

    let query: any;

    if (isPersonalized) {
      // 1. Personalized Mode with Candidate Skills:
      // Relevance Score = Skill exact match (6.0) + Title text match (3.0) + Description text match (1.0)
      // + Controlled Hot Boost (2.5) + Freshness decay
      const candidateSkillsString = candidateCandidateSkillsToQuery(normalizedCandidateSkills);

      query = {
        function_score: {
          query: {
            bool: {
              filter: filterConditions,
              must: mustConditions,
              should: [
                // 1. Exact token matching on normalized skills keyword
                {
                  terms: {
                    skills: normalizedCandidateSkills,
                    boost: 6.0,
                  },
                },
                // 2. Fulltext match in job title
                {
                  match: {
                    name: {
                      query: candidateSkillsString,
                      boost: 3.0,
                    },
                  },
                },
                // 3. Match in description
                {
                  match: {
                    description: {
                      query: candidateSkillsString,
                      boost: 1.0,
                    },
                  },
                },
                // 4. Hot Job Bonus (additive bonus 2.5 - Hot only boosts jobs, doesn't override relevance)
                {
                  bool: {
                    filter: [
                      { term: { isHot: true } },
                      {
                        bool: {
                          should: [
                            { bool: { must_not: { exists: { field: 'boostExpiresAt' } } } },
                            { range: { boostExpiresAt: { gt: nowIso } } },
                          ],
                        },
                      },
                    ],
                    boost: 2.5,
                  },
                },
                // 5. Featured bonus
                {
                  term: {
                    isFeatured: {
                      value: true,
                      boost: 1.0,
                    },
                  },
                },
              ],
              minimum_should_match: 1,
            },
          },
          functions: [
            // Freshness decay (within 14 days)
            {
              gauss: {
                createdAt: {
                  origin: 'now',
                  scale: '14d',
                  decay: 0.5,
                },
              },
              weight: 0.8,
            },
          ],
          score_mode: 'sum',
          boost_mode: 'sum',
        },
      };
    } else {
      // 2. Guest / Non-personalized Mode:
      // Priority: Active HOT jobs (boost 4.0) + Featured (boost 2.0) + Freshness decay + createdAt DESC
      query = {
        function_score: {
          query: {
            bool: {
              filter: filterConditions,
              must: mustConditions,
              should: [
                {
                  bool: {
                    filter: [
                      { term: { isHot: true } },
                      {
                        bool: {
                          should: [
                            { bool: { must_not: { exists: { field: 'boostExpiresAt' } } } },
                            { range: { boostExpiresAt: { gt: nowIso } } },
                          ],
                        },
                      },
                    ],
                    boost: 4.0,
                  },
                },
                {
                  term: {
                    isFeatured: {
                      value: true,
                      boost: 2.0,
                    },
                  },
                },
                {
                  term: {
                    isUrgent: {
                      value: true,
                      boost: 1.5,
                    },
                  },
                },
              ],
            },
          },
          functions: [
            {
              gauss: {
                createdAt: {
                  origin: 'now',
                  scale: '7d',
                  decay: 0.5,
                },
              },
              weight: 1.2,
            },
          ],
          score_mode: 'sum',
          boost_mode: 'sum',
        },
      };
    }

    try {
      const response = await this.client.search({
        index: TALENTPULSE_JOBS_INDEX,
        size,
        body: {
          query,
          sort: [
            { _score: { order: 'desc' } },
            { isHot: { order: 'desc' } },
            { createdAt: { order: 'desc' } },
          ],
        },
      });

      const hits = response.hits?.hits || [];
      const total =
        typeof response.hits?.total === 'number'
          ? response.hits.total
          : (response.hits?.total as any)?.value || hits.length;

      const jobs = hits.map((hit) => ({
        _id: hit._id,
        ...(hit._source as any),
        _score: hit._score,
      }));

      return {
        jobs,
        total,
        isPersonalized,
      };
    } catch (err) {
      this.logger.error(`Error querying Elasticsearch: ${err.message}`);
      return { jobs: [], total: 0, isPersonalized: false };
    }
  }

  /**
   * Tìm kiếm việc làm tổng hợp theo nhiều tiêu chí (Full Job Search)
   */
  async searchJobs(params: {
    query?: string;
    location?: string;
    skills?: string[];
    level?: string;
    minSalary?: number;
    maxSalary?: number;
    isHot?: boolean;
    isFeatured?: boolean;
    isUrgent?: boolean;
    companyId?: string;
    sort?: 'relevance' | 'newest' | 'salary_desc' | 'salary_asc';
    page?: number;
    limit?: number;
  }): Promise<{
    jobs: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      query: keyword,
      location,
      skills = [],
      level,
      minSalary,
      maxSalary,
      isHot,
      isFeatured,
      isUrgent,
      companyId,
      sort = 'relevance',
      page = 1,
      limit = 10,
    } = params;

    const from = (page - 1) * limit;
    const nowIso = new Date().toISOString();

    const must: any[] = [
      { term: { isActive: true } },
      { term: { isDeleted: false } },
      {
        bool: {
          should: [
            { bool: { must_not: { exists: { field: 'startDate' } } } },
            { range: { startDate: { lte: nowIso } } },
          ],
        },
      },
      {
        bool: {
          should: [
            { bool: { must_not: { exists: { field: 'endDate' } } } },
            { range: { endDate: { gt: nowIso } } },
          ],
        },
      },
    ];

    if (keyword && keyword.trim()) {
      must.push({
        bool: {
          should: [
            {
              match: {
                name: {
                  query: keyword,
                  boost: 4.0,
                  fuzziness: 'AUTO',
                },
              },
            },
            {
              match: {
                'name.autocomplete': {
                  query: keyword,
                  boost: 2.5,
                },
              },
            },
            {
              match: {
                description: {
                  query: keyword,
                  boost: 1.0,
                },
              },
            },
            {
              match: {
                'company.name': {
                  query: keyword,
                  boost: 2.0,
                },
              },
            },
            {
              match: {
                'skills.text': {
                  query: keyword,
                  boost: 3.0,
                },
              },
            },
          ],
          minimum_should_match: 1,
        },
      });
    }

    if (location && location.trim() && location.trim() !== 'Tất cả địa điểm') {
      const rawLocation = location.trim();
      const locShould: any[] = [];

      // Split multiple locations if separated by semicolon or comma
      const subLocations = rawLocation
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);

      for (const subLoc of subLocations) {
        // Strip district counts like "Hà Nội (2 quận)"
        const cleanSubLoc = subLoc.replace(/\s*\([^)]*\)/g, '').trim();

        if (/hồ chí minh|hcm|hcmc/i.test(cleanSubLoc)) {
          locShould.push(
            { match_phrase: { 'location.text': { query: 'Hồ Chí Minh', boost: 3.0 } } },
            { match_phrase: { 'location.text': { query: 'TP. Hồ Chí Minh', boost: 3.0 } } },
            { match_phrase: { 'location.text': { query: 'TP Hồ Chí Minh', boost: 3.0 } } },
            { match_phrase: { 'location.text': { query: 'TPHCM', boost: 2.0 } } },
          );
        } else if (/hà nội|hn/i.test(cleanSubLoc)) {
          locShould.push(
            { match_phrase: { 'location.text': { query: 'Hà Nội', boost: 3.0 } } },
            { match_phrase: { 'location.text': { query: 'HN', boost: 2.0 } } },
          );
        } else {
          locShould.push(
            { match_phrase: { 'location.text': { query: cleanSubLoc, boost: 3.0 } } },
            { match: { 'location.text': { query: cleanSubLoc, operator: 'and' } } },
          );
        }

        // If sub-location has hyphen like "Hà Nội - Cầu Giấy", match district as well
        if (cleanSubLoc.includes('-')) {
          const parts = cleanSubLoc.split('-').map((p) => p.trim()).filter(Boolean);
          for (const part of parts) {
            locShould.push({ match_phrase: { 'location.text': { query: part, boost: 2.5 } } });
          }
        }
      }

      if (locShould.length > 0) {
        must.push({
          bool: {
            should: locShould,
            minimum_should_match: 1,
          },
        });
      }
    }

    if (skills.length > 0) {
      const normalizedSkills = skills.map((s) => s.trim().toLowerCase());
      must.push({
        terms: {
          skills: normalizedSkills,
        },
      });
    }

    if (level && level.trim()) {
      must.push({
        term: {
          level: level.trim(),
        },
      });
    }

    if (minSalary != null || maxSalary != null) {
      const salaryRange: any = {};
      if (minSalary != null) salaryRange.gte = Number(minSalary);
      if (maxSalary != null) salaryRange.lte = Number(maxSalary);
      must.push({
        range: {
          salary: salaryRange,
        },
      });
    }

    if (isHot !== undefined) {
      must.push({
        term: {
          isHot: Boolean(isHot),
        },
      });
    }

    if (isFeatured !== undefined) {
      must.push({
        term: {
          isFeatured: Boolean(isFeatured),
        },
      });
    }

    if (isUrgent !== undefined) {
      must.push({
        term: {
          isUrgent: Boolean(isUrgent),
        },
      });
    }

    if (companyId && companyId.trim()) {
      must.push({
        term: {
          'company._id': companyId.trim(),
        },
      });
    }

    // Determine Sort Order
    let esSort: any[] = [];
    if (sort === 'newest') {
      esSort = [
        { isHot: { order: 'desc' } },
        { createdAt: { order: 'desc' } },
        { _score: { order: 'desc' } },
      ];
    } else if (sort === 'salary_desc') {
      esSort = [
        { salary: { order: 'desc', missing: '_last' } },
        { isHot: { order: 'desc' } },
        { _score: { order: 'desc' } },
      ];
    } else if (sort === 'salary_asc') {
      esSort = [
        { salary: { order: 'asc', missing: '_last' } },
        { isHot: { order: 'desc' } },
        { _score: { order: 'desc' } },
      ];
    } else {
      // 'relevance' (default)
      esSort = [
        { isHot: { order: 'desc' } },
        { _score: { order: 'desc' } },
        { createdAt: { order: 'desc' } },
      ];
    }

    try {
      const response = await this.client.search({
        index: TALENTPULSE_JOBS_INDEX,
        from,
        size: limit,
        body: {
          query: {
            bool: {
              must,
            },
          },
          sort: esSort,
        },
      });

      const hits = response.hits?.hits || [];
      const total =
        typeof response.hits?.total === 'number'
          ? response.hits.total
          : (response.hits?.total as any)?.value || 0;

      const jobs = hits.map((h) => ({
        _id: h._id,
        ...(h._source as any),
        _score: h._score,
      }));

      return {
        jobs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    } catch (err) {
      this.logger.error(`Error searching jobs in ES: ${err.message}`);
      return {
        jobs: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }
  }

  /**
   * Lấy các việc làm tương tự / liên quan dựa trên skills, chức danh hoặc công ty
   */
  async getRelatedJobs(
    jobId: string,
    limit = 6,
  ): Promise<any[]> {
    try {
      const nowIso = new Date().toISOString();
      let sourceJob: any = null;

      try {
        const doc = await this.client.get({
          index: TALENTPULSE_JOBS_INDEX,
          id: jobId,
        });
        if (doc?.found) {
          sourceJob = doc._source;
        }
      } catch {
        // Document not found in ES
      }

      const must: any[] = [
        { term: { isActive: true } },
        { term: { isDeleted: false } },
        {
          bool: {
            should: [
              { bool: { must_not: { exists: { field: 'startDate' } } } },
              { range: { startDate: { lte: nowIso } } },
            ],
          },
        },
        {
          bool: {
            should: [
              { bool: { must_not: { exists: { field: 'endDate' } } } },
              { range: { endDate: { gt: nowIso } } },
            ],
          },
        },
      ];

      const mustNot: any[] = [
        { ids: { values: [jobId] } },
      ];

      const should: any[] = [];

      if (sourceJob) {
        if (Array.isArray(sourceJob.skills) && sourceJob.skills.length > 0) {
          should.push({
            terms: {
              skills: sourceJob.skills.map((s: string) => s.toLowerCase()),
              boost: 4.0,
            },
          });
        }
        if (sourceJob.name) {
          should.push({
            match: {
              name: {
                query: sourceJob.name,
                boost: 3.0,
              },
            },
          });
        }
        if (sourceJob.company?._id) {
          should.push({
            term: {
              'company._id': {
                value: sourceJob.company._id,
                boost: 1.5,
              },
            },
          });
        }
      }

      const response = await this.client.search({
        index: TALENTPULSE_JOBS_INDEX,
        size: limit,
        body: {
          query: {
            bool: {
              must,
              must_not: mustNot,
              should: should.length > 0 ? should : undefined,
              minimum_should_match: should.length > 0 ? 1 : 0,
            },
          },
          sort: [
            { isHot: { order: 'desc' } },
            { _score: { order: 'desc' } },
            { createdAt: { order: 'desc' } },
          ],
        },
      });

      const hits = response.hits?.hits || [];
      return hits.map((h) => ({
        _id: h._id,
        ...(h._source as any),
        _score: h._score,
      }));
    } catch (err) {
      this.logger.error(`Error fetching related jobs from ES: ${err.message}`);
      return [];
    }
  }

  /**
   * Gợi ý từ khóa autocomplete khi người dùng gõ tìm kiếm
   */
  async getSearchSuggestions(query: string, limit = 8): Promise<string[]> {
    if (!query || query.trim().length < 2) return [];
    try {
      const q = query.trim();
      const response = await this.client.search({
        index: TALENTPULSE_JOBS_INDEX,
        size: limit * 2,
        body: {
          _source: ['name', 'skills'],
          query: {
            bool: {
              must: [
                { term: { isActive: true } },
                { term: { isDeleted: false } },
              ],
              should: [
                { match_phrase_prefix: { name: { query: q, boost: 3.0 } } },
                { match: { 'name.autocomplete': { query: q, boost: 2.0 } } },
                { match: { 'skills.text': { query: q, boost: 2.5 } } },
              ],
              minimum_should_match: 1,
            },
          },
        },
      });

      const suggestions = new Set<string>();
      const hits = response.hits?.hits || [];

      for (const hit of hits) {
        const source = hit._source as any;
        if (source?.name && source.name.toLowerCase().includes(q.toLowerCase())) {
          suggestions.add(source.name);
        }
        if (Array.isArray(source?.skills)) {
          for (const s of source.skills) {
            if (typeof s === 'string' && s.toLowerCase().includes(q.toLowerCase())) {
              suggestions.add(s);
            }
          }
        }
        if (suggestions.size >= limit) break;
      }

      return Array.from(suggestions).slice(0, limit);
    } catch (err) {
      this.logger.error(`Error fetching suggestions from ES: ${err.message}`);
      return [];
    }
  }
}

function candidateCandidateSkillsToQuery(skills: string[]): string {
  return skills.join(' ');
}

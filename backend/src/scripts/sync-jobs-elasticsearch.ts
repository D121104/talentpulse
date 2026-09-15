import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '../database/data-source';
import { Job } from '../jobs/entities/job.entity';
import {
  ElasticsearchService,
  TALENTPULSE_JOBS_INDEX,
} from '../elasticsearch/elasticsearch.service';
import { ConfigService } from '@nestjs/config';

async function main() {
  console.log('====================================================');
  console.log('🚀 TalentPulse: Synchronizing PostgreSQL Jobs to Elasticsearch');
  console.log('====================================================');

  const esNode = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
  console.log(`📡 Connecting to Elasticsearch at: ${esNode}`);

  const configService = new ConfigService({
    ELASTICSEARCH_NODE: esNode,
  });
  const esService = new ElasticsearchService(configService);

  // 1. Ensure Elasticsearch index with mappings and analyzers exists
  console.log(`📦 Checking/Creating index "${TALENTPULSE_JOBS_INDEX}"...`);
  await esService.ensureIndexExists();

  // 2. Connect to PostgreSQL DataSource
  console.log('🐘 Connecting to PostgreSQL...');
  const dataSource = new DataSource(createDataSourceOptions());
  await dataSource.initialize();
  console.log('✅ PostgreSQL connected successfully');

  // 3. Fetch all active and non-deleted jobs
  const jobRepo = dataSource.getRepository(Job);
  const jobs = await jobRepo.find({
    where: { isDeleted: false },
    order: { createdAt: 'DESC' },
  });

  console.log(`🔍 Found ${jobs.length} non-deleted jobs in PostgreSQL`);

  if (jobs.length > 0) {
    console.log(
      `⏳ Bulk indexing ${jobs.length} jobs to Elasticsearch index "${TALENTPULSE_JOBS_INDEX}"...`,
    );
    const { count, errors } = await esService.bulkIndexJobs(jobs);

    if (errors.length > 0) {
      console.error(
        `⚠️ Encountered ${errors.length} errors during bulk indexing:`,
        errors,
      );
    } else {
      console.log(
        `🎉 Successfully indexed ${count}/${jobs.length} jobs into Elasticsearch!`,
      );
    }
  } else {
    console.log('ℹ️ No jobs to index');
  }

  // 4. Verify count in Elasticsearch
  const esClient = esService.getClient();
  const countResult = await esClient.count({
    index: TALENTPULSE_JOBS_INDEX,
  });
  console.log(
    `📊 Total documents currently in "${TALENTPULSE_JOBS_INDEX}": ${countResult.count}`,
  );

  await dataSource.destroy();
  console.log('====================================================');
  console.log('✅ Elasticsearch Job Synchronization Completed!');
  console.log('====================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Fatal error during Elasticsearch synchronization:', err);
  process.exit(1);
});

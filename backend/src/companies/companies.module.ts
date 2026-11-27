import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { Company } from './entities/company.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { User } from 'src/users/entities/user.entity';
import { Application } from 'src/applications/entities/application.entity';
import { UsersModule } from 'src/users/users.module';
import { RedisModule } from 'src/redis/redis.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ActiveJobsModule } from 'src/active-jobs/active-jobs.module';
import { JobIndexingModule } from 'src/job-indexing/job-indexing.module';
import { ElasticsearchModule } from 'src/elasticsearch/elasticsearch.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Company, Job, User, Application]),
    BullModule.registerQueue({ name: 'job-sync-es' }),
    RedisModule,
    forwardRef(() => UsersModule),
    NotificationsModule,
    ActiveJobsModule,
    JobIndexingModule,
    ElasticsearchModule,
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService, CompaniesModule],
})
export class CompaniesModule {}

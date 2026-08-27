import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { Job } from './entities/job.entity';
import { Company } from 'src/companies/entities/company.entity';
import { Application } from 'src/applications/entities/application.entity';
import { UserCV } from 'src/usercvs/entities/usercv.entity';
import { OnlineCV } from 'src/online-cvs/entities/online-cv.entity';
import { RedisModule } from 'src/redis/redis.module';
import { UsersModule } from 'src/users/users.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AIMatchingModule } from 'src/ai-matching/ai-matching.module';
import { ActiveJobsModule } from 'src/active-jobs/active-jobs.module';
import { ElasticsearchModule } from 'src/elasticsearch/elasticsearch.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job, Company, Application, UserCV, OnlineCV]),
    BullModule.registerQueue({
      name: 'job-sync-es',
    }),
    ElasticsearchModule,
    RedisModule,
    NotificationsModule,
    AIMatchingModule,
    ActiveJobsModule,
    forwardRef(() => UsersModule),
    JwtModule.register({}),
  ],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService, JobsModule],
})
export class JobsModule {}

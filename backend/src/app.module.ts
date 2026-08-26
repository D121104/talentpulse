import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validateEnvironment } from './config/environment.validation';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';

import { AppController } from './app.controller';
import { AppService } from './app.service';

// Modules
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { JobsModule } from './jobs/jobs.module';
import { CompaniesModule } from './companies/companies.module';
import { UserCVsModule } from './usercvs/usercvs.module';
import { ApplicationsModule } from './applications/applications.module';
import { FilesModule } from './files/files.module';
import { SkillsModule } from './skills/skills.module';
import { OtpsModule } from './otps/otps.module';
import { SubscribersModule } from './subscribers/subscribers.module';
import { MailModule } from './mail/mail.module';
import { CommentsModule } from './comments/comments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RedisModule } from './redis/redis.module';
import { AIMatchingModule } from './ai-matching/ai-matching.module';
import { OnlineCVsModule } from './online-cvs/online-cvs.module';
import { ActiveJobsModule } from './active-jobs/active-jobs.module';
import { AiCvConsentsModule } from './ai-consents/ai-cv-consents.module';
import { PaymentsModule } from './payments/payments.module';
import { CandidateAccessModule } from './candidate-access/candidate-access.module';
import { areQueueWorkersEnabled } from './config/runtime-flags';
import { createRedisConnectionOptions } from './redis/redis.module';

const queueWorkersEnabled = areQueueWorkersEnabled();

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnvironment,
    }),

    // Throttle (Rate limiting)
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Schedule (Cron jobs)
    ...(queueWorkersEnabled ? [ScheduleModule.forRoot()] : []),

    // Bull Queue with Redis
    ...(queueWorkersEnabled
      ? [
          BullModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
              redis: {
                ...createRedisConnectionOptions(configService),
              },
            }),
            inject: [ConfigService],
          }),
        ]
      : []),

    // PostgreSQL with TypeORM
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres123'),
        database: configService.get<string>('DB_DATABASE', 'recruitment_db'),
        autoLoadEntities: true,
        synchronize:
          configService.get<string>(
            'DB_SYNCHRONIZE',
            process.env.NODE_ENV === 'production' ? 'false' : 'true',
          ) === 'true',
        ssl:
          process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }),
      inject: [ConfigService],
    }),

    // Feature modules
    UsersModule,
    AuthModule,
    JobsModule,
    CompaniesModule,
    UserCVsModule,
    ApplicationsModule,
    FilesModule,
    SkillsModule,
    OtpsModule,
    SubscribersModule,
    MailModule,
    CommentsModule,
    NotificationsModule,
    RedisModule,
    AIMatchingModule,
    OnlineCVsModule,
    ActiveJobsModule,
    AiCvConsentsModule,
    PaymentsModule,
    CandidateAccessModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

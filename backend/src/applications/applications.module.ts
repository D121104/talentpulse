import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';
import { Application } from './entities/application.entity';
import { CVMatchResult } from 'src/ai-matching/entities/cv-match-result.entity';
import { UsersModule } from 'src/users/users.module';
import { UserCVsModule } from 'src/usercvs/usercvs.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AIMatchingModule } from 'src/ai-matching/ai-matching.module';
import { JobsModule } from 'src/jobs/jobs.module';
import { MailModule } from 'src/mail/mail.module';
import { areQueueWorkersEnabled } from 'src/config/runtime-flags';
import { createNoopQueueProvider } from 'src/queues/queue-runtime';

const queueWorkersEnabled = areQueueWorkersEnabled();

@Module({
  imports: [
    TypeOrmModule.forFeature([Application, CVMatchResult]),
    ...(queueWorkersEnabled
      ? [BullModule.registerQueue({ name: 'mail-queue' })]
      : []),
    UsersModule,
    UserCVsModule,
    NotificationsModule,
    AIMatchingModule,
    MailModule,
    forwardRef(() => JobsModule),
  ],
  controllers: [ApplicationsController],
  providers: [
    ApplicationsService,
    ...(queueWorkersEnabled ? [] : [createNoopQueueProvider('mail-queue')]),
  ],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}

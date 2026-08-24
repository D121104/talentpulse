import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';
import { Application } from './entities/application.entity';
import { CVMatchResult } from 'src/ai-matching/entities/cv-match-result.entity';
import { UsersModule } from 'src/users/users.module';
import { UserCVsModule } from 'src/usercvs/usercvs.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { AIMatchingModule } from 'src/ai-matching/ai-matching.module';
import { JobsModule } from 'src/jobs/jobs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Application, CVMatchResult]),
    UsersModule,
    UserCVsModule,
    NotificationsModule,
    AIMatchingModule,
    forwardRef(() => JobsModule),
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}

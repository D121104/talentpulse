import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandidateAccess } from './entities/candidate-access.entity';
import { CandidateAccessService } from './candidate-access.service';
import {
  CandidateAccessController,
  CandidateViewsController,
} from './candidate-access.controller';
import { User } from 'src/users/entities/user.entity';
import { OnlineCV } from 'src/online-cvs/entities/online-cv.entity';
import { UserCV } from 'src/usercvs/entities/usercv.entity';
import { Job } from 'src/jobs/entities/job.entity';
import { Company } from 'src/companies/entities/company.entity';
import { UsersModule } from 'src/users/users.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CandidateAccess,
      User,
      OnlineCV,
      UserCV,
      Job,
      Company,
    ]),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [CandidateAccessController, CandidateViewsController],
  providers: [CandidateAccessService],
  exports: [CandidateAccessService],
})
export class CandidateAccessModule {}

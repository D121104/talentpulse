import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { InterviewRound } from './entities/interview-round.entity';
import { InterviewParticipant } from './entities/interview-participant.entity';
import { Application } from 'src/applications/entities/application.entity';
import { Company } from 'src/companies/entities/company.entity';
import { User } from 'src/users/entities/user.entity';
import { InterviewsService } from './interviews.service';
import { InterviewsController } from './interviews.controller';
import { InterviewRoomGateway } from './interview-room.gateway';
import { ApplicationsModule } from 'src/applications/applications.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { UsersModule } from 'src/users/users.module';
import { areQueueWorkersEnabled } from 'src/config/runtime-flags';
import { createNoopQueueProvider } from 'src/queues/queue-runtime';

const queueWorkersEnabled = areQueueWorkersEnabled();

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InterviewRound,
      InterviewParticipant,
      Application,
      Company,
      User,
    ]),
    forwardRef(() => ApplicationsModule),
    NotificationsModule,
    UsersModule,
    ...(queueWorkersEnabled
      ? [BullModule.registerQueue({ name: 'mail-queue' })]
      : []),
  ],
  controllers: [InterviewsController],
  providers: [
    InterviewsService,
    InterviewRoomGateway,
    ...(queueWorkersEnabled ? [] : [createNoopQueueProvider('mail-queue')]),
  ],
  exports: [InterviewsService, InterviewRoomGateway],
})
export class InterviewsModule {}

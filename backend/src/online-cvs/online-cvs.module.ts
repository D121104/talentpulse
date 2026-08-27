import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnlineCVsController } from './online-cvs.controller';
import { OnlineCVsService } from './online-cvs.service';
import { OnlineCV } from './entities/online-cv.entity';
import { User } from 'src/users/entities/user.entity';
import { FilesModule } from 'src/files/files.module';
import { UsersModule } from 'src/users/users.module';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OnlineCV, User]),
    FilesModule,
    UsersModule,
    RedisModule,
  ],
  controllers: [OnlineCVsController],
  providers: [OnlineCVsService],
  exports: [OnlineCVsService],
})
export class OnlineCVsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnlineCVsController } from './online-cvs.controller';
import { OnlineCVsService } from './online-cvs.service';
import { OnlineCV } from './entities/online-cv.entity';
import { FilesModule } from 'src/files/files.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OnlineCV]),
    FilesModule,
  ],
  controllers: [OnlineCVsController],
  providers: [OnlineCVsService],
  exports: [OnlineCVsService],
})
export class OnlineCVsModule {}

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnlineCVsController } from './online-cvs.controller';
import { OnlineCVsService } from './online-cvs.service';
import { OnlineCV } from './entities/online-cv.entity';
import { FilesModule } from 'src/files/files.module';
import { UserCVsModule } from 'src/usercvs/usercvs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OnlineCV]),
    FilesModule,
    forwardRef(() => UserCVsModule),
  ],
  controllers: [OnlineCVsController],
  providers: [OnlineCVsService],
  exports: [OnlineCVsService],
})
export class OnlineCVsModule {}

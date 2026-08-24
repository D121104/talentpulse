import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserCV } from './entities/usercv.entity';
import { UserCVsService } from './usercvs.service';
import { UserCVsController } from './usercvs.controller';
import { AIMatchingModule } from 'src/ai-matching/ai-matching.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserCV]), AIMatchingModule],
  controllers: [UserCVsController],
  providers: [UserCVsService],
  exports: [UserCVsService],
})
export class UserCVsModule {}
